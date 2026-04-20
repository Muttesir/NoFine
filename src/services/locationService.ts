import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

import { Storage } from './storage';
import { DISPLAY_ZONES, DisplayZone } from './zones';
import { API } from './api';
import { NotificationService } from './notifications';
import { haversineKm } from '../utils/distance';

const BACKGROUND_TASK = 'nofine-background-location';

const insideZones = new Set<string>();
const entryTimes: Record<string, number> = {};
const dailyNotified = new Set<string>();

function getDayKey(zoneId: string): string {
  return zoneId + '_' + new Date().toDateString();
}

/** Returns midnight at the end of tomorrow. */
function midnightDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export async function handleLocationUpdate(coords: { latitude: number; longitude: number }): Promise<void> {
  const user = await Storage.getUser();
  if (!user) return;

  for (const zone of DISPLAY_ZONES) {
    const dist   = haversineKm(coords.latitude, coords.longitude, zone.lat, zone.lng);
    const inside = dist <= zone.radiusKm;
    const wasInside = insideZones.has(zone.id);

    if (inside && !wasInside) {
      insideZones.add(zone.id);
      entryTimes[zone.id] = Date.now();

      const isDaily = zone.id === 'ccz' || zone.id === 'ulez' || zone.id.startsWith('oxford');
      const dayKey  = getDayKey(zone.id);
      if (isDaily && dailyNotified.has(dayKey)) continue;
      if (isDaily) dailyNotified.add(dayKey);

      console.log(`[GPS] Entered: ${zone.name}`);

      if (zone.chargeType === 'daily') {
        try {
          const result = await API.zoneEntry(user.plate, zone.id) as { deadline?: string };
          const deadline = result.deadline ?? midnightDeadline();
          const charges = await Storage.getCharges();
          charges.push({
            id: Date.now().toString(),
            zoneId: zone.id,
            zoneName: zone.name,
            plate: user.plate,
            enteredAt: new Date().toISOString(),
            fee: zone.fee,
            penaltyFee: zone.penaltyFee,
            deadline,
            payUrl: zone.payUrl,
            paid: false,
          });
          await Storage.saveCharges(charges);

          const unpaidCount = charges.filter(c => !c.paid).length;
          await Notifications.setBadgeCountAsync(unpaidCount);
          await NotificationService.zoneEntry(zone.name, zone.fee, deadline);
          await NotificationService.scheduleDeadlineReminder(zone.name, zone.fee, deadline);
          console.log(`[GPS] Charge created: £${zone.fee}`);
        } catch (e) {
          console.log('[GPS] entry error:', e);
        }
      } else {
        try { await API.zoneEntry(user.plate, zone.id); } catch { /* non-critical */ }
      }
    }

    if (!inside && wasInside) {
      insideZones.delete(zone.id);
      const entryTime = entryTimes[zone.id] ?? Date.now();
      delete entryTimes[zone.id];
      console.log(`[GPS] Exited: ${zone.name}`);

      if (zone.chargeType === 'by_duration') {
        const durationMin = (Date.now() - entryTime) / 60_000;
        if (durationMin < 2) {
          console.log(`[GPS] Visit too short (${durationMin.toFixed(1)}min) — ignoring`);
          continue;
        }
        try {
          const result = await API.zoneExit(user.plate, zone.id) as { fee?: number; deadline?: string };
          const fee      = result.fee ?? zone.fee;
          const deadline = result.deadline ?? midnightDeadline();
          const charges  = await Storage.getCharges();
          charges.push({
            id: Date.now().toString(),
            zoneId: zone.id,
            zoneName: zone.name,
            plate: user.plate,
            enteredAt: new Date(entryTime).toISOString(),
            fee,
            penaltyFee: zone.penaltyFee,
            deadline,
            payUrl: zone.payUrl,
            paid: false,
          });
          await Storage.saveCharges(charges);
          await NotificationService.zoneEntry(zone.name, fee, deadline);
          console.log(`[GPS] Exited ${zone.name} — £${fee} (${durationMin.toFixed(1)}min)`);
        } catch (e) {
          console.log('[GPS] exit error:', e);
        }
      }
    }
  }
}

// Background task definition — must not be re-defined if already registered
if (!TaskManager.isTaskDefined(BACKGROUND_TASK)) {
  TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }: { data: { locations: Location.LocationObject[] }; error: TaskManager.TaskManagerError | null }) => {
    if (error) { console.log('[GPS] background error:', error); return; }
    const loc = data?.locations?.[0];
    if (loc) await handleLocationUpdate(loc.coords);
  });
}

let foregroundSub: Location.LocationSubscription | null = null;

export const LocationService = {
  start: async (): Promise<boolean> => {
    try {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') return false;

      const { status: bg } = await Location.requestBackgroundPermissionsAsync();

      if (bg === 'granted') {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (!isRunning) {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
            timeInterval: 5_000,
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
          });
          console.log('[GPS] Background started');
        }
      } else {
        if (!foregroundSub) {
          foregroundSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
            loc => handleLocationUpdate(loc.coords),
          );
          console.log('[GPS] Foreground started');
        }
      }
      return true;
    } catch (e) {
      console.log('[GPS] start error:', e);
      try {
        if (!foregroundSub) {
          foregroundSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
            loc => handleLocationUpdate(loc.coords),
          );
          console.log('[GPS] Fallback foreground started');
        }
        return true;
      } catch {
        return false;
      }
    }
  },

  stop: async (): Promise<void> => {
    try {
      if (foregroundSub) { foregroundSub.remove(); foregroundSub = null; }
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
      if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
    } catch (e) {
      console.log('[GPS] stop error:', e);
    }
  },
};
