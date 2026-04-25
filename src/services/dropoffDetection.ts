// ALL imports must be at the top — do not move below executable code
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

import { Storage, GPSState, DropoffVisit } from './storage';
import { API } from './api';
import { TERMINAL_ZONES, TerminalZone, CCZ_ZONE, isCCZChargeActive } from './zones';
import { saveDropoffPoint, parseZoneId } from './dropoffStorage';
import { haversineKm } from '../utils/distance';

const BACKGROUND_TASK = 'nofine-dropoff-task';

// Background task — must be defined at module load before any async work
if (!TaskManager.isTaskDefined(BACKGROUND_TASK)) {
  TaskManager.defineTask(BACKGROUND_TASK, async ({
    data, error,
  }: {
    data: { locations: Location.LocationObject[] };
    error: TaskManager.TaskManagerError | null;
  }) => {
    if (error) { console.log('[BG] error:', error); return; }
    const loc = data?.locations?.[0];
    if (loc) await handleLocation(loc.coords);
  });
}

// Yes/No notification actions — registered at module level so they fire
// even when the app is woken in background (opensApp: false)
Notifications.addNotificationResponseReceivedListener(async (response) => {
  const { actionIdentifier, notification } = response;
  const data = notification.request.content.data as any;
  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  if (data?.type !== 'dropoff_pending') return;
  const visit = await Storage.getPendingVisit();
  if (!visit) return;
  if (actionIdentifier === 'YES') {
    await captureDropoffPoint(visit);
    await confirmDropoff(visit);
    await Storage.clearPendingVisit();
  } else if (actionIdentifier === 'NO') {
    discardDropoff();
    await Storage.clearPendingVisit();
  }
});

// ─── Constants ────────────────────────────────────────────────────────────────
const TEST_MODE   = false;
const COOLDOWN_MS = TEST_MODE ? 5_000 : 600_000; // 10 min cooldown after a drop-off

// Speed threshold: if GPS speed >= 10 km/h (2.78 m/s) at the mid point,
// the vehicle is moving — skip detection. Only < 10 km/h counts as a genuine stop.
const MAX_SPEED_MS = 2.78;

// ─── Per-terminal detection state (in-memory, resets on app restart) ──────────
//
// Flow:  entry zone ──► mid zone (stop 2–30 min) ──► exit zone  =  drop-off
//
// "passedEntry" must be true before mid is tracked.
// Trigger fires when passedMid becomes true with valid duration.
// Exit zone is an additional confirmation (not strictly required).
//
interface TerminalState {
  passedEntry: boolean;
  inMid: boolean;
  midEntryTime: number | null;
  passedMid: boolean;
  triggered: boolean;
}

const termStates = new Map<string, TerminalState>();

function getState(id: string): TerminalState {
  if (!termStates.has(id)) {
    termStates.set(id, {
      passedEntry: false,
      inMid: false,
      midEntryTime: null,
      passedMid: false,
      triggered: false,
    });
  }
  return termStates.get(id)!;
}

function resetState(id: string): void {
  termStates.set(id, {
    passedEntry: false,
    inMid: false,
    midEntryTime: null,
    passedMid: false,
    triggered: false,
  });
}

// ─── Module-level state (persisted) ──────────────────────────────────────────
let cooldownUntil  = 0;
let cczIsInside    = false;
let cczChargedDate: string | null = null;
let stateLoaded    = false;

// Last known location (for self-learning data capture)
interface Coords { latitude: number; longitude: number; timestamp: number; }
let lastKnownLocation: Coords | null = null;

export function getLastKnownLocation(): Coords | null { return lastKnownLocation; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toDateString();
}

function midnightDeadline(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Returns distance in metres between two coordinates. */
function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000;
}

// ─── State persistence ────────────────────────────────────────────────────────

async function loadPersistedState(): Promise<void> {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const s = await Storage.getGPSState();
    if (!s) return;
    cooldownUntil  = s.cooldownUntil  ?? 0;
    cczIsInside    = s.cczIsInside    ?? false;
    cczChargedDate = s.cczChargedDate ?? null;
    console.log('[STATE] Restored. Cooldown until:', new Date(cooldownUntil).toLocaleTimeString());
  } catch (e) {
    console.log('[STATE] restore error:', e);
  }
}

async function persistState(): Promise<void> {
  const snapshot: GPSState = { cooldownUntil, cczIsInside, cczChargedDate };
  try {
    await Storage.saveGPSState(snapshot);
  } catch (e) {
    console.log('[STATE] persist error:', e);
  }
}

// ─── Fee calculation ──────────────────────────────────────────────────────────

function calculateAirportFee(zoneId: string, baseFee: number, durationMin: number): number {
  if (zoneId.startsWith('heathrow'))  return baseFee;                                           // £7 flat
  if (zoneId === 'stansted')          return durationMin <= 15 ? 10 : 28;                       // £10 or £28
  if (zoneId === 'luton')             return durationMin <= 10 ? 7 : 7 + Math.ceil(durationMin - 10);
  if (zoneId.startsWith('gatwick'))   return durationMin <= 10 ? 10 : 10 + Math.ceil(durationMin - 10);
  if (zoneId === 'london_city')       return durationMin <= 5  ? 8 : 8 + Math.ceil(durationMin - 5);
  return baseFee;
}

// ─── CCZ daily charge ─────────────────────────────────────────────────────────

async function handleCCZEntry(): Promise<void> {
  try {
    if (!isCCZChargeActive()) {
      console.log('[CCZ] Outside charge hours, skipping');
      return;
    }
    if (cczChargedDate === todayKey()) {
      console.log('[CCZ] Already charged today');
      return;
    }
    cczChargedDate = todayKey();
    await persistState();

    const user = await Storage.getUser();
    if (!user) return;

    const charges = await Storage.getCharges();
    charges.push({
      id: Date.now().toString(),
      zoneId: CCZ_ZONE.id,
      zoneName: CCZ_ZONE.name,
      plate: user.plate,
      enteredAt: new Date().toISOString(),
      fee: CCZ_ZONE.fee,
      penaltyFee: CCZ_ZONE.penaltyFee,
      deadline: midnightDeadline().toISOString(),
      payUrl: CCZ_ZONE.payUrl,
      paid: false,
    });
    await Storage.saveCharges(charges);

    await Notifications.setBadgeCountAsync(charges.filter(c => !c.paid).length);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚧 Congestion Charge Zone',
        body: `£${CCZ_ZONE.fee} due today · Pay before midnight to avoid £${CCZ_ZONE.penaltyFee} penalty`,
        sound: true,
      },
      trigger: { type: 'timeInterval', seconds: 2, repeats: false } as unknown as null,
    });

    try { await API.zoneEntry(user.plate, CCZ_ZONE.id); } catch { /* non-critical */ }
    console.log('[CCZ] Charge created: £' + CCZ_ZONE.fee);
  } catch (e) {
    console.log('[CCZ] handleCCZEntry error:', e);
  }
}

// ─── Drop-off trigger ─────────────────────────────────────────────────────────

async function triggerDropoff(zone: TerminalZone, midEntryTime: number, midExitTime: number): Promise<void> {
  const durationMin = (midExitTime - midEntryTime) / 60_000;
  const actualFee   = calculateAirportFee(zone.id, zone.fee, durationMin);

  console.log(`[DROPOFF] ✅ ${zone.name} · ${durationMin.toFixed(1)} min · £${actualFee.toFixed(2)}`);

  const visit: DropoffVisit = {
    zoneId: zone.id,
    zoneName: zone.name,
    fee: actualFee,
    penaltyFee: zone.penaltyFee,
    payUrl: zone.payUrl,
    entryTime: midEntryTime,
    exitTime: midExitTime,
    durationMin,
  };

  cooldownUntil = Date.now() + COOLDOWN_MS;
  await persistState();

  await Storage.savePendingVisit(visit);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `✈️ Drop-off at ${zone.name}`,
      body: `${Math.round(durationMin)} min · £${actualFee.toFixed(2)} — Did you drop off passengers?`,
      sound: true,
      data: { type: 'dropoff_pending' },
      categoryIdentifier: 'dropoff_confirm',
    },
    trigger: { type: 'timeInterval', seconds: 1, repeats: false } as unknown as null,
  });

  // NOTE: No React callback here — background task must not update React state.
  // App shows popup via AppState 'active' listener (checkPendingVisit) in App.tsx.
}

// ─── Core location handler ────────────────────────────────────────────────────

async function handleLocation(coords: Location.LocationObjectCoords): Promise<void> {
  await loadPersistedState();

  const { latitude: lat, longitude: lng, speed } = coords;
  const now = Date.now();

  lastKnownLocation = { latitude: lat, longitude: lng, timestamp: now };

  // ── CCZ daily charge check ─────────────────────────────────────────────────
  const insideCCZ = haversineKm(lat, lng, CCZ_ZONE.lat, CCZ_ZONE.lng) <= CCZ_ZONE.radiusKm;
  if (insideCCZ && !cczIsInside) {
    cczIsInside = true;
    console.log('[CCZ] Entered zone');
    handleCCZEntry(); // fire-and-forget; persisted inside
  }
  if (!insideCCZ && cczIsInside) {
    cczIsInside = false;
    console.log('[CCZ] Exited zone');
  }

  // ── Airport drop-off detection (3-point sequential) ───────────────────────
  if (now < cooldownUntil) return;

  for (const zone of TERMINAL_ZONES) {
    const s = getState(zone.id);
    if (s.triggered) continue;

    const dEntry = distM(lat, lng, zone.entry.lat, zone.entry.lng);
    const dMid   = distM(lat, lng, zone.mid.lat,   zone.mid.lng);
    const dExit  = distM(lat, lng, zone.exit.lat,  zone.exit.lng);

    const inEntry = dEntry <= zone.entry.radiusM;
    const inMid   = dMid   <= zone.mid.radiusM;
    const inExit  = dExit  <= zone.exit.radiusM;

    // Step 1 — Confirm entry zone
    if (inEntry && !s.passedEntry) {
      s.passedEntry = true;
      console.log(`[DROPOFF] → Entry: ${zone.name}`);
    }

    // Step 2 — Enter mid zone (only counts if entry was seen first)
    if (inMid && s.passedEntry && !s.inMid && !s.passedMid) {
      // Speed check: if moving fast, it's just a pass-through — skip
      if (speed !== null && speed !== undefined && speed > MAX_SPEED_MS) {
        console.log(`[DROPOFF] Too fast at mid (${(speed * 3.6).toFixed(0)} km/h) — ${zone.name}`);
        resetState(zone.id);
        continue;
      }
      s.inMid = true;
      s.midEntryTime = now;
      console.log(`[DROPOFF] → Mid (drop-off lane): ${zone.name}`);
    }

    // Step 3 — Left mid zone
    if (!inMid && s.inMid && s.midEntryTime !== null) {
      s.inMid = false;
      s.passedMid = true;
      const midExitTime = now;
      const durationMin = (midExitTime - s.midEntryTime) / 60_000;

      console.log(`[DROPOFF] ← Left mid: ${zone.name} · ${durationMin.toFixed(1)} min`);

      if (durationMin < 2) {
        console.log(`[DROPOFF] Too short (${durationMin.toFixed(1)} min) — ignoring`);
        resetState(zone.id);
        continue;
      }
      if (durationMin > 30) {
        console.log(`[DROPOFF] Likely parked (${durationMin.toFixed(1)} min) — ignoring`);
        resetState(zone.id);
        continue;
      }

      // Valid duration — trigger drop-off
      s.triggered = true;
      await triggerDropoff(zone, s.midEntryTime, midExitTime);

      // Reset all terminal states after triggering (cooldown handles duplicates)
      for (const id of termStates.keys()) resetState(id);
      break;
    }

    // Bonus: exit zone reached after mid — also trigger if somehow not already done
    if (inExit && s.passedMid && !s.triggered && s.midEntryTime !== null) {
      const durationMin = (now - s.midEntryTime) / 60_000;
      if (durationMin >= 2 && durationMin <= 30) {
        s.triggered = true;
        await triggerDropoff(zone, s.midEntryTime, now);
        for (const id of termStates.keys()) resetState(id);
        break;
      }
    }

    // Safety reset: if entry was seen >45 min ago but mid never triggered,
    // the driver is probably just parked nearby — clear stale state
    if (s.passedEntry && !s.passedMid && s.midEntryTime === null) {
      // No timer tracked yet — passedEntry alone doesn't expire
      // (handled by cooldown + natural state reset above)
    }
  }
}

// ─── Self-learning data capture ───────────────────────────────────────────────

async function captureDropoffPoint(visit: DropoffVisit): Promise<void> {
  if (!lastKnownLocation) return;
  if (visit.durationMin < 2 || visit.durationMin > 15) return;
  const [airport, terminal] = parseZoneId(visit.zoneId);
  await saveDropoffPoint({
    lat: lastKnownLocation.latitude,
    lng: lastKnownLocation.longitude,
    airport,
    terminal,
    duration: Math.round(visit.durationMin),
    timestamp: new Date().toISOString(),
  });
  console.log('[LEARN] Dropoff point saved:', airport, terminal);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function confirmDropoff(visit: DropoffVisit): Promise<void> {
  try {
    const user = await Storage.getUser();
    if (!user) return;

    const charges = await Storage.getCharges();
    charges.push({
      id: Date.now().toString(),
      zoneId: visit.zoneId,
      zoneName: visit.zoneName,
      plate: user.plate,
      enteredAt: new Date(visit.entryTime).toISOString(),
      exitedAt: new Date(visit.exitTime).toISOString(),
      durationMinutes: Math.round(visit.durationMin),
      fee: visit.fee,
      penaltyFee: visit.penaltyFee,
      deadline: midnightDeadline().toISOString(),
      payUrl: visit.payUrl,
      paid: false,
    });
    await Storage.saveCharges(charges);

    await Notifications.setBadgeCountAsync(charges.filter(c => !c.paid).length);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `✈️ ${visit.zoneName}`,
        body: `£${visit.fee.toFixed(2)} due · Pay before midnight to avoid a penalty`,
        sound: true,
      },
      trigger: { type: 'timeInterval', seconds: 2, repeats: false } as unknown as null,
    });

    try { await API.zoneEntry(user.plate, visit.zoneId); } catch { /* non-critical */ }
    console.log('[DROPOFF] Saved: £' + visit.fee);
  } catch (e) {
    console.log('[DROPOFF] confirmDropoff error:', e);
  }
}

export function discardDropoff(): void {
  cooldownUntil = 0;
  persistState().catch(() => {});
  console.log('[DROPOFF] Discarded, cooldown reset');
}

// ─── Location service ─────────────────────────────────────────────────────────

let subscription: Location.LocationSubscription | null = null;

export const DropoffService = {
  start: async (): Promise<boolean> => {
    await loadPersistedState();
    try {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') return false;

      const { status: bg } = await Location.requestBackgroundPermissionsAsync();

      if (bg === 'granted') {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (!running) {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
            // High accuracy (not BestForNavigation) — sufficient for 30–60m radius zones,
            // avoids conflicts with Uber/Waze/Maps and reduces battery drain
            accuracy: Location.Accuracy.High,
            distanceInterval: 15,
            timeInterval: 8_000,
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
          });
          console.log('[DROPOFF] Background GPS started');
        }
      } else {
        if (!subscription) {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 8_000 },
            loc => handleLocation(loc.coords),
          );
          console.log('[DROPOFF] Foreground GPS started');
        }
      }
      return true;
    } catch (e) {
      console.log('[DROPOFF] start error:', e);
      try {
        if (!subscription) {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 8_000 },
            loc => handleLocation(loc.coords),
          );
          console.log('[DROPOFF] Fallback foreground GPS started');
        }
        return true;
      } catch {
        return false;
      }
    }
  },

  stop: async (): Promise<void> => {
    try {
      if (subscription) { subscription.remove(); subscription = null; }
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
    } catch (e) {
      console.log('[DROPOFF] stop error:', e);
    }
  },
};

// Re-export DropoffVisit so App.tsx can import it from one place
export type { DropoffVisit };
