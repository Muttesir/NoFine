// ALL imports must be at the top — do not move below executable code
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

import { Storage, GPSState, DropoffVisit } from './storage';
import { API } from './api';
import { DETECTION_ZONES, CCZ_ZONE, isCCZChargeActive, DetectionZone } from './zones';
import { saveDropoffPoint, parseZoneId } from './dropoffStorage';
import { haversineKm } from '../utils/distance';
import { pointInPolygon } from '../utils/geometry';

const BACKGROUND_TASK = 'nofine-dropoff-task';

// Background task must be defined at module load, before any async work
if (!TaskManager.isTaskDefined(BACKGROUND_TASK)) {
  TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }: { data: { locations: Location.LocationObject[] }; error: TaskManager.TaskManagerError | null }) => {
    if (error) { console.log('[BG] error:', error); return; }
    const loc = data?.locations?.[0];
    if (loc) await handleLocation(loc.coords);
  });
}

// Handle Yes/No notification actions in background (opensApp: false)
// Registered at module level so it fires even when app is woken in background
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

const TEST_MODE = false;
const STABILITY_MS = TEST_MODE ? 1_000 : 30_000;
const COOLDOWN_MS  = TEST_MODE ? 5_000 : 600_000;

// ─── Module-level state (persisted to AsyncStorage) ───────────────────────────
let isInsideZone   = false;
let currentZone: DetectionZone | null = null;
let entryTime: number | null = null;
let entryCandidateAt: number | null = null;
let exitCandidateAt: number | null = null;
let cooldownUntil  = 0;
let cczIsInside    = false;
let cczChargedDate: string | null = null;

let stateLoaded    = false;
let dropoffCallback: ((visit: DropoffVisit) => void) | null = null;

// ─── Last known GPS location (for self-learning data capture) ─────────────────
interface Coords { latitude: number; longitude: number; timestamp: number; }
let lastKnownLocation: Coords | null = null;
let entryLocation: { latitude: number; longitude: number } | null = null;

export function getLastKnownLocation(): Coords | null { return lastKnownLocation; }
export function getEntryLocation(): { latitude: number; longitude: number } | null { return entryLocation; }

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns a string key for today, used to guard duplicate daily charges. */
function todayKey(): string {
  return new Date().toDateString();
}

/** Returns midnight at the end of tomorrow (gives ~24–48h to pay). */
function midnightDeadline(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── State persistence ────────────────────────────────────────────────────────

async function loadPersistedState(): Promise<void> {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const s = await Storage.getGPSState();
    if (!s) return;
    isInsideZone     = s.isInsideZone     ?? false;
    currentZone      = s.currentZone      ?? null;
    entryTime        = s.entryTime        ?? null;
    entryCandidateAt = s.entryCandidateAt ?? null;
    exitCandidateAt  = s.exitCandidateAt  ?? null;
    cooldownUntil    = s.cooldownUntil    ?? 0;
    cczIsInside      = s.cczIsInside      ?? false;
    cczChargedDate   = s.cczChargedDate   ?? null;
    console.log('[STATE] Restored:', isInsideZone ? `inside ${currentZone?.name}` : 'outside');
  } catch (e) {
    console.log('[STATE] restore error:', e);
  }
}

async function persistState(): Promise<void> {
  const snapshot: GPSState = {
    isInsideZone, currentZone, entryTime,
    entryCandidateAt, exitCandidateAt, cooldownUntil,
    cczIsInside, cczChargedDate,
  };
  try {
    await Storage.saveGPSState(snapshot);
  } catch (e) {
    console.log('[STATE] persist error:', e);
  }
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
    await persistState(); // Persist immediately to prevent duplicates on restart

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

    const unpaid = charges.filter(c => !c.paid).length;
    await Notifications.setBadgeCountAsync(unpaid);
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

// ─── Core location handler ────────────────────────────────────────────────────

async function handleLocation(coords: { latitude: number; longitude: number }): Promise<void> {
  await loadPersistedState();

  lastKnownLocation = { latitude: coords.latitude, longitude: coords.longitude, timestamp: Date.now() };

  const now = Date.now();

  // CCZ daily charge check
  const cczDist = haversineKm(coords.latitude, coords.longitude, CCZ_ZONE.lat, CCZ_ZONE.lng);
  const insideCCZ = cczDist <= CCZ_ZONE.radiusKm;
  if (insideCCZ && !cczIsInside) {
    cczIsInside = true;
    console.log('[CCZ] Entered zone');
    handleCCZEntry(); // fire-and-forget; state is persisted inside
  }
  if (!insideCCZ && cczIsInside) {
    cczIsInside = false;
    console.log('[CCZ] Exited zone');
  }

  if (now < cooldownUntil) return;

  const zone = findZone(coords.latitude, coords.longitude);
  const inside = zone !== null;

  // Entering zone — start stability timer
  if (inside && !isInsideZone) {
    isInsideZone     = true;
    currentZone      = zone;
    entryCandidateAt = now;
    exitCandidateAt  = null;
    entryTime        = null;
    console.log('[DROPOFF] Entered zone:', zone.name);
    await persistState();
  }

  // Confirm entry after stability period
  if (isInsideZone && entryTime === null && entryCandidateAt && now - entryCandidateAt >= STABILITY_MS) {
    entryTime = entryCandidateAt;
    entryLocation = lastKnownLocation ? { latitude: lastKnownLocation.latitude, longitude: lastKnownLocation.longitude } : null;
    console.log('[DROPOFF] Entry confirmed:', currentZone?.name);
    await persistState();
  }

  // Exiting zone — start exit stability timer
  if (!inside && isInsideZone) {
    if (!exitCandidateAt) {
      exitCandidateAt = now;
      console.log('[DROPOFF] Exited zone:', currentZone?.name);
      await persistState();
    }

    if (now - exitCandidateAt >= STABILITY_MS) {
      const exitT  = exitCandidateAt;
      const entryT = entryTime;
      const z      = currentZone;

      // Reset state before async work
      isInsideZone     = false;
      currentZone      = null;
      entryTime        = null;
      entryCandidateAt = null;
      exitCandidateAt  = null;
      cooldownUntil    = now + COOLDOWN_MS;
      await persistState();

      if (!entryT || !z) {
        console.log('[DROPOFF] No confirmed entry — ignoring');
        return;
      }

      const durationMin = (exitT - entryT) / 60_000;
      console.log('[DROPOFF] Duration:', durationMin.toFixed(1), 'min');

      if (durationMin < 2) {
        console.log('[DROPOFF] Visit too short — ignoring');
        return;
      }
      if (durationMin > 30) {
        console.log('[DROPOFF] Likely parked (>30min) — ignoring');
        return;
      }

      console.log('[DROPOFF] Valid drop-off detected:', z.name);

      // Duration'a göre gerçek ücreti hesapla
      const actualFee = calculateAirportFee(z.id, z.fee, durationMin);
      console.log('[DROPOFF] Fee:', actualFee.toFixed(2), `(${durationMin.toFixed(1)} min)`);

      const visit: DropoffVisit = {
        zoneId: z.id,
        zoneName: z.name,
        fee: actualFee,
        penaltyFee: z.penaltyFee,
        payUrl: z.payUrl,
        entryTime: entryT,
        exitTime: exitT,
        durationMin,
      };

      // Always persist + notify — works even when app is closed
      await Storage.savePendingVisit(visit);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `✈️ Drop-off at ${z.name}`,
          body: `${Math.round(durationMin)} min · £${actualFee.toFixed(2)} — Did you drop off passengers?`,
          sound: true,
          data: { type: 'dropoff_pending' },
          categoryIdentifier: 'dropoff_confirm',
        },
        trigger: { type: 'timeInterval', seconds: 1, repeats: false } as unknown as null,
      });

      // If app is in foreground, show confirmation popup immediately
      if (dropoffCallback) {
        dropoffCallback(visit);
      }
    }
  }

  // Re-entered zone before exit timer expired — cancel exit
  if (inside && exitCandidateAt) {
    exitCandidateAt = null;
    console.log('[DROPOFF] Re-entered zone, exit cancelled');
  }
}

// ─── Zone lookup ──────────────────────────────────────────────────────────────

// Duration'a göre gerçek havalimanı ücretini hesapla
function calculateAirportFee(zoneId: string, baseFee: number, durationMin: number): number {
  // Heathrow — flat £7 per entry
  if (zoneId.startsWith('heathrow')) return baseFee;

  // Stansted — 0-15dk: £10, 15-30dk: £28
  if (zoneId === 'stansted') return durationMin <= 15 ? 10 : 28;

  // Luton — 0-10dk: £7, sonra +£1/dk
  if (zoneId === 'luton') return durationMin <= 10 ? 7 : 7 + Math.ceil(durationMin - 10);

  // Gatwick — 0-10dk: £10, sonra +£1/dk
  if (zoneId.startsWith('gatwick')) return durationMin <= 10 ? 10 : 10 + Math.ceil(durationMin - 10);

  // London City — 0-5dk: £8, sonra +£1/dk
  if (zoneId === 'london_city') return durationMin <= 5 ? 8 : 8 + Math.ceil(durationMin - 5);

  return baseFee;
}

function findZone(lat: number, lon: number): DetectionZone | null {
  for (const zone of DETECTION_ZONES) {
    // Use polygon if defined (more accurate), else fall back to radius
    const inside = zone.polygon
      ? pointInPolygon(lat, lon, zone.polygon)
      : haversineKm(lat, lon, zone.lat, zone.lng) <= zone.radiusKm;
    if (inside) return zone;
  }
  return null;
}

// ─── Self-learning data capture ──────────────────────────────────────────────

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
    entryLat: entryLocation?.latitude,
    entryLng: entryLocation?.longitude,
  });
  console.log('[LEARN] Dropoff point saved:', airport, terminal);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function onDropoffDetected(cb: (visit: DropoffVisit) => void): void {
  dropoffCallback = cb;
}

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

    const unpaid = charges.filter(c => !c.paid).length;
    await Notifications.setBadgeCountAsync(unpaid);
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
    console.log('[DROPOFF] save error:', e);
  }
}

export function discardDropoff(): void {
  // Reset cooldown so the zone can be re-detected if the user drives through again
  cooldownUntil = 0;
  persistState().catch(() => {});
  console.log('[DROPOFF] Discarded, cooldown reset');
}

// ─── Location service ─────────────────────────────────────────────────────────

let subscription: Location.LocationSubscription | null = null;

export const DropoffService = {
  start: async (): Promise<boolean> => {
    // Load persisted state eagerly so cczChargedDate is available before first GPS update
    await loadPersistedState();

    try {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') return false;

      const { status: bg } = await Location.requestBackgroundPermissionsAsync();

      if (bg === 'granted') {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (!running) {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 10,
            timeInterval: 5_000,
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
          });
          console.log('[DROPOFF] Background GPS started');
        }
      } else {
        // Foreground-only fallback
        if (!subscription) {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 10, timeInterval: 5_000 },
            loc => handleLocation(loc.coords),
          );
          console.log('[DROPOFF] Foreground GPS started');
        }
      }
      return true;
    } catch (e) {
      console.log('[DROPOFF] start error:', e);
      // Last-resort foreground fallback
      try {
        if (!subscription) {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 10, timeInterval: 5_000 },
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
