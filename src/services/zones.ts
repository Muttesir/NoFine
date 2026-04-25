// Single source of truth for all zone data.
// TerminalZone → used by dropoffDetection.ts (3-point entry/mid/exit detection)
// DisplayZone  → used by HomeScreen / TrackingScreen (UI cards, distance)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
  radiusM: number; // metres
}

export interface TerminalZone {
  id: string;
  name: string;
  level: 'Ground' | 'Upper'; // Upper = elevated viaduct (Departures forecourt)
  fee: number;
  penaltyFee: number;
  payUrl: string;
  entry: GeoPoint; // Ramp / forecourt entrance
  mid: GeoPoint;   // Terminal drop-off lane (stopping area)
  exit: GeoPoint;  // Return road / forecourt exit
}

export interface DisplayZone {
  id: string;
  name: string;
  shortName: string;
  emoji: string;
  lat: number;
  lng: number;
  radiusKm: number;
  fee: number;
  penaltyFee: number;
  chargeType: 'per_entry' | 'by_duration' | 'daily';
  note: string;
  payUrl: string;
}

export interface CCZConfig {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  fee: number;
  penaltyFee: number;
  payUrl: string;
}

// ─── CCZ (used by dropoffDetection for daily charge logic) ───────────────────
export const CCZ_ZONE: CCZConfig = {
  id: 'ccz',
  name: 'Congestion Charge Zone',
  lat: 51.5155,
  lng: -0.1100,
  radiusKm: 2.8,
  fee: 15,
  penaltyFee: 160,
  payUrl: 'https://tfl.gov.uk/modes/driving/congestion-charge/pay-or-register-a-congestion-charge',
};

/** Returns true when CCZ charge is active (Mon–Fri 07:00–18:00, Sat 12:00–18:00). */
export function isCCZChargeActive(): boolean {
  const now = new Date();
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (day === 0) return false;                       // Sunday — free
  if (day === 6) return mins >= 720 && mins < 1080;  // Saturday 12:00–18:00
  return mins >= 420 && mins < 1080;                 // Mon–Fri 07:00–18:00
}

export function isULEZChargeActive(): boolean {
  return true; // 24/7
}

export function shouldCharge(zoneId: string): boolean {
  if (zoneId === 'ccz') return isCCZChargeActive();
  return true;
}

// ─── Terminal zones — 3-point detection system ────────────────────────────────
//
// Each terminal has entry / mid / exit GeoPoints with radius in metres.
// Detection logic (dropoffDetection.ts):
//   entry zone → mid zone (stop 2–30 min) → exit zone  =  confirmed drop-off
//
// Heathrow T2/T3/T5: Upper level (Departures viaduct, ~7m above ground).
// Heathrow T4, Luton, Stansted, London City: Ground level.
// Gatwick North/South: Upper level (Departures forecourt).
//
// Coordinates sourced from airport maps (WGS84 decimal degrees).
// Verify in Google Maps satellite view before production release.
//
export const TERMINAL_ZONES: TerminalZone[] = [
  // ── Heathrow T2 ─────────────────────────────────────────────────────────────
  {
    id: 'heathrow_t2', name: 'Heathrow T2', level: 'Upper',
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    entry: { lat: 51.469413, lng: -0.452761, radiusM: 40 },
    mid:   { lat: 51.469467, lng: -0.452384, radiusM: 50 },
    exit:  { lat: 51.469153, lng: -0.452666, radiusM: 40 },
  },
  // ── Heathrow T3 ─────────────────────────────────────────────────────────────
  {
    id: 'heathrow_t3', name: 'Heathrow T3', level: 'Upper',
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    entry: { lat: 51.470658, lng: -0.456179, radiusM: 40 },
    mid:   { lat: 51.470934, lng: -0.456869, radiusM: 50 },
    exit:  { lat: 51.471609, lng: -0.457196, radiusM: 40 },
  },
  // ── Heathrow T4 ─────────────────────────────────────────────────────────────
  {
    id: 'heathrow_t4', name: 'Heathrow T4', level: 'Ground',
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    entry: { lat: 51.458659, lng: -0.446559, radiusM: 40 },
    mid:   { lat: 51.459063, lng: -0.446320, radiusM: 50 },
    exit:  { lat: 51.459545, lng: -0.445464, radiusM: 40 },
  },
  // ── Heathrow T5 ─────────────────────────────────────────────────────────────
  {
    id: 'heathrow_t5', name: 'Heathrow T5', level: 'Upper',
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    entry: { lat: 51.473171, lng: -0.489698, radiusM: 40 },
    mid:   { lat: 51.472095, lng: -0.489704, radiusM: 60 },
    exit:  { lat: 51.470033, lng: -0.489794, radiusM: 40 },
  },
  // ── Gatwick North ────────────────────────────────────────────────────────────
  {
    id: 'gatwick_north', name: 'Gatwick North', level: 'Upper',
    fee: 10, penaltyFee: 100,
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off/pay-drop-off-charge/',
    entry: { lat: 51.160406, lng: -0.174467, radiusM: 35 },
    mid:   { lat: 51.161030, lng: -0.174615, radiusM: 50 },
    exit:  { lat: 51.161938, lng: -0.175079, radiusM: 40 },
  },
  // ── Gatwick South ────────────────────────────────────────────────────────────
  {
    id: 'gatwick_south', name: 'Gatwick South', level: 'Upper',
    fee: 10, penaltyFee: 100,
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off/pay-drop-off-charge/',
    entry: { lat: 51.155091, lng: -0.158185, radiusM: 35 },
    mid:   { lat: 51.155859, lng: -0.159185, radiusM: 50 },
    exit:  { lat: 51.158050, lng: -0.159652, radiusM: 40 },
  },
  // ── Stansted ─────────────────────────────────────────────────────────────────
  {
    id: 'stansted', name: 'Stansted', level: 'Ground',
    fee: 10, penaltyFee: 100,
    payUrl: 'https://www.stanstedairport.com/parking/express-set-down/',
    entry: { lat: 51.887606, lng: 0.260197, radiusM: 35 },
    mid:   { lat: 51.888911, lng: 0.262153, radiusM: 60 },
    exit:  { lat: 51.891033, lng: 0.265349, radiusM: 40 },
  },
  // ── Luton ────────────────────────────────────────────────────────────────────
  {
    id: 'luton', name: 'Luton', level: 'Ground',
    fee: 7, penaltyFee: 95,
    payUrl: 'https://lutondropoff.apcoa.com/latepaysearch/vrnsearch',
    entry: { lat: 51.877764, lng: -0.372110, radiusM: 30 },
    mid:   { lat: 51.877871, lng: -0.372293, radiusM: 40 },
    exit:  { lat: 51.877062, lng: -0.372685, radiusM: 30 },
  },
  // ── London City ──────────────────────────────────────────────────────────────
  {
    id: 'london_city', name: 'London City', level: 'Ground',
    fee: 8, penaltyFee: 80,
    payUrl: 'https://www.londoncityairport.com/to-and-from-the-airport/by-car/drop-off-charge/',
    entry: { lat: 51.504800, lng: 0.051200, radiusM: 35 },
    mid:   { lat: 51.505200, lng: 0.052800, radiusM: 45 },
    exit:  { lat: 51.505600, lng: 0.054200, radiusM: 35 },
  },
];

// ─── Display zones (UI cards, distance calculations) ──────────────────────────
export const DISPLAY_ZONES: DisplayZone[] = [
  {
    id: 'heathrow_t2', name: 'Heathrow T2', shortName: 'LHR T2', emoji: '✈️',
    lat: 51.4697, lng: -0.4522, radiusKm: 0.18,
    fee: 7, penaltyFee: 80, chargeType: 'per_entry',
    note: '£7 per entry · max 10min',
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
  },
  {
    id: 'heathrow_t3', name: 'Heathrow T3', shortName: 'LHR T3', emoji: '✈️',
    lat: 51.4705, lng: -0.4571, radiusKm: 0.18,
    fee: 7, penaltyFee: 80, chargeType: 'per_entry',
    note: '£7 per entry · max 10min',
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
  },
  {
    id: 'heathrow_t4', name: 'Heathrow T4', shortName: 'LHR T4', emoji: '✈️',
    lat: 51.4582, lng: -0.4455, radiusKm: 0.18,
    fee: 7, penaltyFee: 80, chargeType: 'per_entry',
    note: '£7 per entry · max 10min',
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
  },
  {
    id: 'heathrow_t5', name: 'Heathrow T5', shortName: 'LHR T5', emoji: '✈️',
    lat: 51.4744, lng: -0.4909, radiusKm: 0.18,
    fee: 7, penaltyFee: 80, chargeType: 'per_entry',
    note: '£7 per entry · max 10min',
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
  },
  {
    id: 'gatwick_north', name: 'Gatwick North', shortName: 'GTW North', emoji: '✈️',
    lat: 51.1618, lng: -0.1762, radiusKm: 0.20,
    fee: 10, penaltyFee: 100, chargeType: 'by_duration',
    note: '0–10min: £10 · +£1/min after',
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off/pay-drop-off-charge/',
  },
  {
    id: 'gatwick_south', name: 'Gatwick South', shortName: 'GTW South', emoji: '✈️',
    lat: 51.1565, lng: -0.1595, radiusKm: 0.20,
    fee: 10, penaltyFee: 100, chargeType: 'by_duration',
    note: '0–10min: £10 · +£1/min after',
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off/pay-drop-off-charge/',
  },
  {
    id: 'stansted', name: 'Stansted Airport', shortName: 'Stansted', emoji: '✈️',
    lat: 51.8850, lng: 0.2628, radiusKm: 0.8,
    fee: 10, penaltyFee: 100, chargeType: 'by_duration',
    note: '0–15min: £10 · 15–30min: £28',
    payUrl: 'https://www.stanstedairport.com/parking/express-set-down/',
  },
  {
    id: 'luton', name: 'Luton Airport', shortName: 'Luton', emoji: '✈️',
    lat: 51.8747, lng: -0.3683, radiusKm: 0.8,
    fee: 7, penaltyFee: 95, chargeType: 'by_duration',
    note: '0–10min: £7 · +£1/min after',
    payUrl: 'https://lutondropoff.apcoa.com/latepaysearch/vrnsearch',
  },
  {
    id: 'london_city', name: 'London City Airport', shortName: 'London City', emoji: '✈️',
    lat: 51.5032, lng: 0.0532, radiusKm: 0.6,
    fee: 8, penaltyFee: 80, chargeType: 'by_duration',
    note: '0–5min: £8 · +£1/min after',
    payUrl: 'https://www.londoncityairport.com/to-and-from-the-airport/by-car/drop-off-charge/',
  },
  {
    id: 'ccz', name: 'Congestion Charge Zone', shortName: 'CCZ', emoji: '🚧',
    lat: 51.5155, lng: -0.1100, radiusKm: 2.8,
    fee: 15, penaltyFee: 160, chargeType: 'daily',
    note: '£15/day · Mon–Fri 07:00–18:00',
    payUrl: 'https://tfl.gov.uk/modes/driving/congestion-charge/pay-or-register-a-congestion-charge',
  },
  {
    id: 'ulez', name: 'Ultra Low Emission Zone', shortName: 'ULEZ', emoji: '♻️',
    lat: 51.5074, lng: -0.1278, radiusKm: 18.0,
    fee: 12.5, penaltyFee: 180, chargeType: 'daily',
    note: '£12.50/day · 24/7',
    payUrl: 'https://tfl.gov.uk/modes/driving/ultra-low-emission-zone/check-if-you-need-to-pay',
  },
];
