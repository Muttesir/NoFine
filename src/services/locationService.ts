import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { handleZoneDetection, setConfirmationCallback } from './dropoffDetection';
import { Storage } from './storage';
import { ZONES, API } from './api';
import { NotificationService } from './notifications';

const BACKGROUND_TASK = 'nofine-background-location';

const insideZones = new Set<string>();
const entryTimes: Record<string, number> = {};
const dailyNotified = new Set<string>();

function getDayKey(zoneId: string) {
  return zoneId + '_' + new Date().toDateString();
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export async function handleLocationUpdate(coords: { latitude: number; longitude: number }) {
  const user = await Storage.getUser();
  if (!user) return;

  for (const zone of ZONES) {
    if (!zone) continue;
    const dist = haversine(coords.latitude, coords.longitude, zone.lat, zone.lng);
    const inside = dist <= zone.radiusKm;
    const wasInside = insideZones.has(zone.id);

    // Use smart detection for airports, simple for CCZ/ULEZ
    const useSmartDetection = zone.chargeType === 'per_entry' || zone.chargeType === 'by_duration';
    
    if (useSmartDetection) {
      const ts = Date.now();
      handleZoneDetection(zone.id, zone.name, zone.fee, zone.penaltyFee, zone.payUrl, inside, ts);
    }

    if (inside && !wasInside) {
      insideZones.add(zone.id);
      entryTimes[zone.id] = Date.now();

      const isDaily = zone.id.startsWith('oxford') || zone.id === 'ccz' || zone.id === 'ulez';
      const dayKey = getDayKey(zone.id);
      if (isDaily && dailyNotified.has(dayKey)) continue;
      if (isDaily) dailyNotified.add(dayKey);

      console.log(`[GPS] ENTERED: ${zone.name}`);

      if (!useSmartDetection && zone.chargeType === 'daily') {
        try {
          const result = await API.zoneEntry(user.plate, zone.id);
          const charges = await Storage.getCharges();
          charges.push({
            id: Date.now().toString(),
            zoneId: zone.id,
            zoneName: zone.name,
            plate: user.plate,
            enteredAt: new Date().toISOString(),
            fee: zone.fee,
            penaltyFee: zone.penaltyFee,
            deadline: result.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            payUrl: zone.payUrl,
            paid: false,
          });
          await Storage.saveCharges(charges);
          const freshCharges = await Storage.getCharges();
          const unpaidCount = freshCharges.filter((c: any) => !c.paid).length;
          console.log("[BADGE] unpaid count:", unpaidCount);
          await Notifications.setBadgeCountAsync(unpaidCount);
          console.log("[NOTIF] sending zone entry notification"); 
          await NotificationService.zoneEntry(zone.name, zone.fee, result.deadline);
          await NotificationService.scheduleDeadlineReminder(zone.name, zone.fee, result.deadline);
          console.log(`[GPS] Charge created: £${zone.fee}`);
        } catch (e) {
          console.log('[GPS] entry error:', e);
        }
      } else {
        try { await API.zoneEntry(user.plate, zone.id); } catch (e) {}
      }
    }

    if (!inside && wasInside) {
      insideZones.delete(zone.id);
      const entryTime = entryTimes[zone.id] || Date.now();
      delete entryTimes[zone.id];
      console.log(`[GPS] EXITED: ${zone.name}`);

      if (zone.chargeType === 'by_duration') {
        const durationMin = (Date.now() - entryTime) / 60000;
        if (durationMin < 2) {
          console.log(`[GPS] Ignored short visit: ${durationMin.toFixed(1)}min`);
          continue;
        }
        try {
          const result = await API.zoneExit(user.plate, zone.id);
          const fee = result.fee || zone.fee;
          const charges = await Storage.getCharges();
          charges.push({
            id: Date.now().toString(),
            zoneId: zone.id,
            zoneName: zone.name,
            plate: user.plate,
            enteredAt: new Date(entryTime).toISOString(),
            fee,
            penaltyFee: zone.penaltyFee,
            deadline: result.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            payUrl: zone.payUrl,
            paid: false,
          });
          await Storage.saveCharges(charges);
          await NotificationService.zoneEntry(zone.name, fee, result.deadline);
          console.log(`[GPS] Exited ${zone.name} - £${fee} (${durationMin.toFixed(1)}min)`);
        } catch (e) {
          console.log('[GPS] exit error:', e);
        }
      }
    }
  }
}

// Background task — PRODUCTION
if (!TaskManager.isTaskDefined(BACKGROUND_TASK)) {
  TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }: any) => {
    if (error) { console.log('[GPS] background error:', error); return; }
    const { locations } = data;
    if (!locations?.[0]) return;
    await handleLocationUpdate(locations[0].coords);
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
        // Background mode
        const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (!isRunning) {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
            timeInterval: 5000,
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
          });
          console.log('[GPS] Background started');
        }
      } else {
        // Foreground only
        if (!foregroundSub) {
          foregroundSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
            (loc) => handleLocationUpdate(loc.coords)
          );
          console.log('[GPS] Foreground started');
        }
      }
      return true;
    } catch (e) {
      console.log('[GPS] start error:', e);
      // Fallback to foreground
      try {
        if (!foregroundSub) {
          foregroundSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
            (loc) => handleLocationUpdate(loc.coords)
          );
          console.log('[GPS] Fallback foreground started');
        }
        return true;
      } catch (e2) {
        console.log('[GPS] fallback error:', e2);
        return false;
      }
    }
  },

  stop: async () => {
    try {
      if (foregroundSub) { foregroundSub.remove(); foregroundSub = null; }
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
      if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
    } catch (e) {
      console.log('[GPS] stop error:', e);
    }
  },
};
