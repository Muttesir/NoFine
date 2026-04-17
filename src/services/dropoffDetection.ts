import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const BACKGROUND_TASK = "nofine-dropoff-task";

// Define background task OUTSIDE component
if (!TaskManager.isTaskDefined(BACKGROUND_TASK)) {
  TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }: any) => {
    if (error) { console.log("[BG] error:", error); return; }
    const { locations } = data;
    if (locations?.[0]) handleLocation(locations[0].coords);
  });
}
import * as Notifications from "expo-notifications";
import { Storage } from "./storage";
import { DROPOFF_ZONES, API } from "./api";

const TEST_MODE = false;
const STABILITY_MS = TEST_MODE ? 1000 : 30000;
const COOLDOWN_MS = TEST_MODE ? 5000 : 600000;

// ─── CCZ Daily Charge ────────────────────────────────────────────────────────
const CCZ_ZONE = {
  id: "ccz",
  name: "Congestion Charge Zone",
  lat: 51.5155,
  lng: -0.1100,
  radiusKm: 2.8,
  fee: 15,
  penaltyFee: 160,
  payUrl: "https://tfl.gov.uk/modes/driving/congestion-charge/pay-or-register-a-congestion-charge",
};

// Bugün CCZ charge zaten oluşturuldu mu?
let cczChargedDate: string | null = null;
let cczIsInside = false;

function todayKey(): string {
  return new Date().toDateString(); // "Fri Apr 17 2026"
}

function isCCZActive(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mins = now.getHours() * 60 + now.getMinutes();
  if (day === 0) return false;                         // Pazar — ücretsiz
  if (day === 6) return mins >= 720 && mins < 1080;    // Cumartesi 12:00–18:00
  return mins >= 420 && mins < 1080;                   // Pzt–Cum 07:00–18:00
}

async function handleCCZEntry(): Promise<void> {
  try {
    if (!isCCZActive()) {
      console.log("[CCZ] Charge saati değil, geçildi");
      return;
    }
    if (cczChargedDate === todayKey()) {
      console.log("[CCZ] Bugün zaten charge oluşturuldu");
      return;
    }
    cczChargedDate = todayKey();

    const user = await Storage.getUser();
    if (!user) return;

    const deadline = new Date();
    deadline.setHours(23, 59, 59, 999);

    const charges = await Storage.getCharges();
    charges.push({
      id: Date.now().toString(),
      zoneId: CCZ_ZONE.id,
      zoneName: CCZ_ZONE.name,
      plate: user.plate,
      enteredAt: new Date().toISOString(),
      fee: CCZ_ZONE.fee,
      penaltyFee: CCZ_ZONE.penaltyFee,
      deadline: deadline.toISOString(),
      payUrl: CCZ_ZONE.payUrl,
      paid: false,
    });
    await Storage.saveCharges(charges);

    const unpaid = charges.filter((c: any) => !c.paid).length;
    await Notifications.setBadgeCountAsync(unpaid);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🚧 Congestion Charge Zone",
        body: `£${CCZ_ZONE.fee} due today · Pay before midnight to avoid £${CCZ_ZONE.penaltyFee} penalty`,
        sound: true,
      },
      trigger: { type: "timeInterval", seconds: 2, repeats: false } as any,
    });

    try { await API.zoneEntry(user.plate, CCZ_ZONE.id); } catch (e) {}
    console.log("[CCZ] Charge oluşturuldu: £" + CCZ_ZONE.fee);
  } catch (e) {
    console.log("[CCZ] handleCCZEntry error:", e);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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
let stateLoaded = false;

// App kapanıp background task yeniden başlayınca state'i geri yükle
async function loadPersistedState() {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const s = await Storage.getGPSState();
    if (!s) return;
    isInsideZone = s.isInsideZone ?? false;
    currentZone = s.currentZone ?? null;
    entryTime = s.entryTime ?? null;
    entryCandidateAt = s.entryCandidateAt ?? null;
    exitCandidateAt = s.exitCandidateAt ?? null;
    cooldownUntil = s.cooldownUntil ?? 0;
    cczIsInside = s.cczIsInside ?? false;
    cczChargedDate = s.cczChargedDate ?? null;
    console.log("[STATE] Restored:", isInsideZone ? `inside ${currentZone?.name}` : "outside");
  } catch (e) { console.log("[STATE] restore error:", e); }
}

async function persistState() {
  try {
    await Storage.saveGPSState({
      isInsideZone, currentZone, entryTime,
      entryCandidateAt, exitCandidateAt, cooldownUntil,
      cczIsInside, cczChargedDate,
    });
  } catch (e) { console.log("[STATE] persist error:", e); }
}

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

async function handleLocation(coords: { latitude: number; longitude: number }) {
  // App kapanıp background task başlarsa state'i geri yükle (sadece ilk kez)
  await loadPersistedState();

  const now = Date.now();

  // ── CCZ günlük ücret kontrolü ──
  const cczDist = haversine(coords.latitude, coords.longitude, CCZ_ZONE.lat, CCZ_ZONE.lng);
  const insideCCZ = cczDist <= CCZ_ZONE.radiusKm;
  if (insideCCZ && !cczIsInside) {
    cczIsInside = true;
    console.log("[CCZ] Zone'a girildi");
    handleCCZEntry(); // async, fire-and-forget
  }
  if (!insideCCZ && cczIsInside) {
    cczIsInside = false;
    console.log("[CCZ] Zone'dan çıkıldı");
  }
  // ──────────────────────────────

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
    await persistState();
  }

  if (isInsideZone && entryTime === null && entryCandidateAt && now - entryCandidateAt >= STABILITY_MS) {
    entryTime = entryCandidateAt;
    console.log("[DROPOFF] Entry confirmed:", currentZone?.name);
    await persistState();
  }

  if (!inside && isInsideZone) {
    if (!exitCandidateAt) {
      exitCandidateAt = now;
      console.log("[DROPOFF] Exited zone:", currentZone?.name);
      await persistState();
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
      await persistState();
      if (!entryT || !z) { console.log("[DROPOFF] No entry, ignoring"); return; }
      const durationMin = (exitT - entryT) / 60000;
      console.log("[DROPOFF] Duration:", durationMin.toFixed(1), "min");
      if (durationMin < 2) { console.log("[DROPOFF] Too short"); return; }
      if (durationMin > 15) { console.log("[DROPOFF] Parking"); return; }
      console.log("[DROPOFF] Valid:", z.name);
      const visit: DropoffVisit = { zoneId: z.id, zoneName: z.name, fee: z.fee, penaltyFee: z.penaltyFee, payUrl: z.payUrl, entryTime: entryT, exitTime: exitT, durationMin };

      // Her zaman storage'a kaydet + notification gönder (app kapalı olsa bile çalışır)
      await Storage.savePendingVisit(visit);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `✈️ ${z.name} — Drop-off yaptınız mı?`,
          body: `${Math.round(durationMin)} dk · £${z.fee.toFixed(2)} ödenmesi gerekebilir · Kontrol etmek için dokunun`,
          sound: true,
          data: { type: "dropoff_pending" },
        },
        trigger: { type: "timeInterval", seconds: 1, repeats: false } as any,
      });

      // App açıksa popup da göster
      if (dropoffCallback) {
        dropoffCallback(visit);
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
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== "granted") return false;

      const { status: bg } = await Location.requestBackgroundPermissionsAsync();

      if (bg === "granted") {
        // Background mode
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (!running) {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
            timeInterval: 5000,
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
          });
          console.log("[DROPOFF] Background GPS started");
        }
      } else {
        // Foreground fallback
        if (!subscription) {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
            (loc) => handleLocation(loc.coords)
          );
          console.log("[DROPOFF] Foreground GPS started");
        }
      }
      return true;
    } catch (e) {
      console.log("[DROPOFF] start error:", e);
      // Fallback to foreground
      try {
        if (!subscription) {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
            (loc) => handleLocation(loc.coords)
          );
          console.log("[DROPOFF] Fallback foreground started");
        }
        return true;
      } catch (e2) { return false; }
    }
  },
  stop: async () => {
    try {
      if (subscription) { subscription.remove(); subscription = null; }
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
    } catch (e) { console.log("[DROPOFF] stop error:", e); }
  },
};
