import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Storage } from "./storage";
import { DROPOFF_ZONES, API } from "./api";

const TEST_MODE = false;
const STABILITY_MS = TEST_MODE ? 1000 : 30000;
const COOLDOWN_MS = TEST_MODE ? 5000 : 600000;

export interface DropoffVisit {
  zoneId: string;
  zoneName: string;
  fee: number;
  penaltyFee: number;
  payUrl: string;
  entryTime: number;
  exitTime: number;
  durationMin: number;
}

let isInsideZone = false;
let currentZone: any = null;
let entryTime: number | null = null;
let entryCandidateAt: number | null = null;
let exitCandidateAt: number | null = null;
let cooldownUntil = 0;
let dropoffCallback: ((visit: DropoffVisit) => void) | null = null;

export function onDropoffDetected(cb: (visit: DropoffVisit) => void) {
  dropoffCallback = cb;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findZone(lat: number, lon: number): any | null {
  for (const zone of DROPOFF_ZONES) {
    if (!zone) continue;
    if (zone.type !== "INNER") continue;
    const dist = haversine(lat, lon, zone.lat, zone.lng);
    if (dist <= zone.radiusKm) return zone;
  }
  return null;
}

function handleLocation(coords: { latitude: number; longitude: number }) {
  const now = Date.now();
  if (now < cooldownUntil) return;

  const zone = findZone(coords.latitude, coords.longitude);
  const inside = zone !== null;

  if (inside && !isInsideZone) {
    isInsideZone = true;
    currentZone = zone;
    entryCandidateAt = now;
    exitCandidateAt = null;
    entryTime = null;
    console.log("[DROPOFF] Entered zone:", zone.name);
  }

  if (isInsideZone && entryTime === null && entryCandidateAt && now - entryCandidateAt >= STABILITY_MS) {
    entryTime = entryCandidateAt;
    console.log("[DROPOFF] Entry confirmed:", currentZone?.name);
  }

  if (!inside && isInsideZone) {
    if (!exitCandidateAt) {
      exitCandidateAt = now;
      console.log("[DROPOFF] Exited zone:", currentZone?.name);
    }
    if (now - exitCandidateAt >= STABILITY_MS) {
      const exitT = exitCandidateAt;
      const entryT = entryTime;
      const z = currentZone;
      isInsideZone = false;
      currentZone = null;
      entryTime = null;
      entryCandidateAt = null;
      exitCandidateAt = null;
      cooldownUntil = now + COOLDOWN_MS;
      if (!entryT || !z) { console.log("[DROPOFF] No entry, ignoring"); return; }
      const durationMin = (exitT - entryT) / 60000;
      console.log("[DROPOFF] Duration:", durationMin.toFixed(1), "min");
      if (durationMin < 2) { console.log("[DROPOFF] Too short"); return; }
      if (durationMin > 15) { console.log("[DROPOFF] Parking"); return; }
      console.log("[DROPOFF] Valid:", z.name);
      if (dropoffCallback) {
        dropoffCallback({ zoneId: z.id, zoneName: z.name, fee: z.fee, penaltyFee: z.penaltyFee, payUrl: z.payUrl, entryTime: entryT, exitTime: exitT, durationMin });
      }
    }
  }

  if (inside && exitCandidateAt) {
    exitCandidateAt = null;
    console.log("[DROPOFF] Re-entered, exit cancelled");
  }
}

export async function confirmDropoff(visit: DropoffVisit) {
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
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      payUrl: visit.payUrl,
      paid: false,
    });
    await Storage.saveCharges(charges);
    const unpaid = charges.filter((c: any) => !c.paid).length;
    await Notifications.setBadgeCountAsync(unpaid);
    await Notifications.scheduleNotificationAsync({
      content: { title: `✈️ ${visit.zoneName}`, body: `£${visit.fee.toFixed(2)} due · Pay before midnight`, sound: true },
      trigger: { type: "timeInterval", seconds: 2, repeats: false } as any,
    });
    try { await API.zoneEntry(user.plate, visit.zoneId); } catch (e) {}
    console.log("[DROPOFF] Saved: £" + visit.fee);
  } catch (e) { console.log("[DROPOFF] save error:", e); }
}

export function discardDropoff() {
  console.log("[DROPOFF] Discarded");
}

let subscription: Location.LocationSubscription | null = null;

export const DropoffService = {
  start: async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return false;
      if (subscription) return true;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (loc) => handleLocation(loc.coords)
      );
      console.log("[DROPOFF] Service started");
      return true;
    } catch (e) { console.log("[DROPOFF] start error:", e); return false; }
  },
  stop: () => { if (subscription) { subscription.remove(); subscription = null; } },
};
