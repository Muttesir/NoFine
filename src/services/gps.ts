import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Storage } from './storage';
import { ZONES, API } from './api';
import { NotificationService } from './notifications';

const TASK_NAME = 'nofine-background-location';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const insideZones = new Set<string>();
const dailyNotified = new Set<string>(); // Oxford CCZ için günlük tek bildirim

function getDayKey(zoneId: string): string {
  const today = new Date().toDateString();
  return zoneId + '_' + today;
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }: any) => {
  if (error) return;
  const { locations } = data;
  const loc = locations[0];
  if (!loc) return;

  const user = await Storage.getUser();
  if (!user) return;

  for (const zone of ZONES) {
    const dist = haversine(loc.coords.latitude, loc.coords.longitude, zone.lat, zone.lng);
    const inside = dist <= zone.radiusKm;
    const wasInside = insideZones.has(zone.id);

    if (inside && !wasInside) {
      // Oxford CCZ için günlük tek bildirim kontrolü
      const isOxfordCCZ = zone.id.startsWith('oxford_ccz');
      const dayKey = getDayKey(zone.id);
      if (isOxfordCCZ && dailyNotified.has(dayKey)) {
        insideZones.add(zone.id);
        continue;
      }
      if (isOxfordCCZ) dailyNotified.add(dayKey);
      insideZones.add(zone.id);
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
          deadline: result.deadline,
          payUrl: zone.payUrl,
          paid: false,
        });
        await Storage.saveCharges(charges);
        await NotificationService.zoneEntry(zone.name, zone.fee, result.deadline);
        await NotificationService.scheduleDeadlineReminder(zone.name, zone.fee, result.deadline);
      } catch (e) {
        console.log('Zone entry error:', e);
      }
    }

    if (!inside && wasInside) {
      insideZones.delete(zone.id);
      try {
        await API.zoneExit(user.plate, zone.id);
      } catch (e) {
        console.log('Zone exit error:', e);
      }
    }
  }
});

export const GPS = {
  start: async () => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== 'granted') return false;
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 50,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'NoFine',
        notificationBody: 'Monitoring airport zones...',
      },
    });
    return true;
  },
  stop: async () => {
    const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (running) await Location.stopLocationUpdatesAsync(TASK_NAME);
  },
  isRunning: () => Location.hasStartedLocationUpdatesAsync(TASK_NAME),
};
