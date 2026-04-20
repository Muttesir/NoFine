import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { Storage } from './storage';
import { DISPLAY_ZONES } from './zones';
import { API } from './api';
import { NotificationService } from './notifications';
import { haversineKm } from '../utils/distance';

const TASK_NAME = 'nofine-background-location';

const insideZones  = new Set<string>();
const dailyNotified = new Set<string>();

function getDayKey(zoneId: string): string {
  return zoneId + '_' + new Date().toDateString();
}

if (!TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async ({ data, error }: { data: { locations: Location.LocationObject[] }; error: TaskManager.TaskManagerError | null }) => {
    if (error) return;
    const loc = data?.locations?.[0];
    if (!loc) return;

    const user = await Storage.getUser();
    if (!user) return;

    for (const zone of DISPLAY_ZONES) {
      const dist    = haversineKm(loc.coords.latitude, loc.coords.longitude, zone.lat, zone.lng);
      const inside  = dist <= zone.radiusKm;
      const wasInside = insideZones.has(zone.id);

      if (inside && !wasInside) {
        const isDaily = zone.id === 'ccz' || zone.id === 'ulez' || zone.id.startsWith('oxford');
        const dayKey  = getDayKey(zone.id);
        if (isDaily && dailyNotified.has(dayKey)) {
          insideZones.add(zone.id);
          continue;
        }
        if (isDaily) dailyNotified.add(dayKey);
        insideZones.add(zone.id);

        try {
          const result = await API.zoneEntry(user.plate, zone.id) as { deadline?: string };
          const deadline = result.deadline ?? new Date(Date.now() + 86_400_000).toISOString();
          const charges  = await Storage.getCharges();
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
          await NotificationService.zoneEntry(zone.name, zone.fee, deadline);
          await NotificationService.scheduleDeadlineReminder(zone.name, zone.fee, deadline);
        } catch (e) {
          console.log('[GPS] zone entry error:', e);
        }
      }

      if (!inside && wasInside) {
        insideZones.delete(zone.id);
        try { await API.zoneExit(user.plate, zone.id); } catch { /* non-critical */ }
      }
    }
  });
}

export const GPS = {
  start: async (): Promise<boolean> => {
    try {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') return false;

      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      const isRunning = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
      if (isRunning) return true;

      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 50,
        showsBackgroundLocationIndicator: bg === 'granted',
        ...(bg === 'granted' ? {
          foregroundService: {
            notificationTitle: 'NoFine',
            notificationBody: 'Monitoring airport zones...',
          },
        } : {}),
      });
      return true;
    } catch (e) {
      console.log('[GPS] start error:', e);
      return false;
    }
  },

  stop: async (): Promise<void> => {
    const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(TASK_NAME);
  },

  isRunning: (): Promise<boolean> =>
    Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false),
};
