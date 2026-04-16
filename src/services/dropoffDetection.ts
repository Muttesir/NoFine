
// src/services/dropoffDetection.ts
import { Storage } from './storage';
import { NotificationService } from './notifications';
import { API } from './api';

// ─── Types ───────────────────────────────────────────────────
interface ZoneVisit {
  zoneId: string;
  zoneName: string;
  fee: number;
  penaltyFee: number;
  payUrl: string;
  entryTime: number;
  exitTime?: number;
}

interface DetectionState {
  isInsideZone: boolean;
  entryConfirmed: boolean;
  entryTime: number | null;
  activeVisit: ZoneVisit | null;
  exitCandidateTime: number | null;
  entryCandidateTime: number | null;
  cooldownUntil: number;
}

// ─── State (per zone) ────────────────────────────────────────
const states: Record<string, DetectionState> = {};

function getState(zoneId: string): DetectionState {
  if (!states[zoneId]) {
    states[zoneId] = {
      isInsideZone: false,
      entryConfirmed: false,
      entryTime: null,
      activeVisit: null,
      exitCandidateTime: null,
      entryCandidateTime: null,
      cooldownUntil: 0,
    };
  }
  return states[zoneId];
}

// ─── Confirmation callback (set by UI) ───────────────────────
type ConfirmCallback = (visit: ZoneVisit) => void;
let onConfirmationNeeded: ConfirmCallback | null = null;

export function setConfirmationCallback(cb: ConfirmCallback) {
  onConfirmationNeeded = cb;
}

// ─── User answered YES ───────────────────────────────────────
export async function confirmDropoff(visit: ZoneVisit) {
  console.log('[DROPOFF] Drop-off confirmed:', visit.zoneName);
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
      exitedAt: visit.exitTime ? new Date(visit.exitTime).toISOString() : undefined,
      durationMinutes: visit.exitTime ? Math.round((visit.exitTime - visit.entryTime) / 60000) : 0,
      fee: visit.fee,
      penaltyFee: visit.penaltyFee,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      payUrl: visit.payUrl,
      paid: false,
    });
    await Storage.saveCharges(charges);
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await NotificationService.zoneEntry(visit.zoneName, visit.fee, deadline);
    await NotificationService.scheduleDeadlineReminder(visit.zoneName, visit.fee, deadline);
    // Also notify backend
    try { await API.zoneEntry(user.plate, visit.zoneId); } catch (e) {}
    console.log('[DROPOFF] Charge saved: £' + visit.fee);
  } catch (e) {
    console.log('[DROPOFF] save error:', e);
  }
}

// ─── User answered NO ────────────────────────────────────────
export function discardDropoff(visit: ZoneVisit) {
  console.log('[DROPOFF] Discarded:', visit.zoneName);
}

// ─── Main detection function ─────────────────────────────────
export function handleZoneDetection(
  zoneId: string,
  zoneName: string,
  fee: number,
  penaltyFee: number,
  payUrl: string,
  isCurrentlyInside: boolean,
  now: number = Date.now()
) {
  const state = getState(zoneId);

  // Skip if in cooldown
  if (now < state.cooldownUntil) {
    console.log('[DROPOFF] In cooldown, ignoring');
    return;
  }

  // ── ENTRY LOGIC ──────────────────────────────────────────
  if (isCurrentlyInside && !state.isInsideZone) {
    // Just entered — start stability check
    state.entryCandidateTime = now;
    state.isInsideZone = true;
    state.entryConfirmed = false;
    state.exitCandidateTime = null;
    console.log('[DROPOFF] Entered zone:', zoneName);
  }

  // Confirm entry after 30 seconds stability
  if (
    state.isInsideZone &&
    !state.entryConfirmed &&
    state.entryCandidateTime &&
    now - state.entryCandidateTime >= 1000 // 1 sec for testing
  ) {
    state.entryConfirmed = true;
    state.entryTime = state.entryCandidateTime;
    state.activeVisit = { zoneId, zoneName, fee, penaltyFee, payUrl, entryTime: state.entryTime };
    console.log('[DROPOFF] Stability confirmed:', zoneName);
  }

  // ── EXIT LOGIC ───────────────────────────────────────────
  if (!isCurrentlyInside && state.isInsideZone) {
    if (state.exitCandidateTime === null) {
      state.exitCandidateTime = now;
      console.log('[DROPOFF] Possible exit detected:', zoneName);
    }

    // Confirm exit after 30 seconds outside
    if (now - state.exitCandidateTime >= 1000) { // 1 sec for testing
      const exitTime = state.exitCandidateTime;
      const visit = state.activeVisit;

      // Reset state
      state.isInsideZone = false;
      state.entryConfirmed = false;
      state.entryTime = null;
      state.entryCandidateTime = null;
      state.exitCandidateTime = null;
      state.activeVisit = null;
      state.cooldownUntil = now + 10 * 60 * 1000; // 10 min cooldown

      if (!visit || !visit.entryTime) {
        console.log('[DROPOFF] No active visit, ignoring');
        return;
      }

      const duration = (exitTime - visit.entryTime) / 60000;
      console.log('[DROPOFF] Duration:', duration.toFixed(1), 'min');

      if (duration < 2) {
        console.log('[DROPOFF] Ignored — too short (<2 min)');
        return;
      }

      if (duration > 15) {
        console.log('[DROPOFF] Ignored as parking (>15 min)');
        return;
      }

      // Valid drop-off window (2-15 min)
      console.log('[DROPOFF] Marked as drop-off —', zoneName);
      const finalVisit: ZoneVisit = { ...visit, exitTime };

      if (onConfirmationNeeded) {
        onConfirmationNeeded(finalVisit);
      }
    }
  }

  // User came back before exit was confirmed
  if (isCurrentlyInside && state.exitCandidateTime !== null) {
    console.log('[DROPOFF] Re-entered zone, cancelling exit');
    state.exitCandidateTime = null;
  }
}
