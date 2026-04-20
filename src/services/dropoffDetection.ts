// ALL imports must be at the top — do not move below executable code
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

import { Storage, GPSState, DropoffVisit } from './storage';
import { API } from './api';
import { DETECTION_ZONES, CCZ_ZONE, isCCZChargeActive, DetectionZone } from './zones';
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
      if (durationMin > 15) {
        console.log('[DROPOFF] Likely parked — ignoring');
        return;
      }

      console.log('[DROPOFF] Valid drop-off detected:', z.name);

      const visit: DropoffVisit = {
        zoneId: z.id,
        zoneName: z.name,
        fee: z.fee,
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
          title: 'Airport drop-off detected',
          body: `You stayed ${Math.round(durationMin)} min at ${z.name}. Tap to confirm.`,
          sound: true,
          data: { type: 'dropoff_pending' },
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
