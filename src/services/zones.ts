// Single source of truth for all zone data.
// DisplayZone   → used by HomeScreen / TrackingScreen (general airport boundary)
// DetectionZone → used by dropoffDetection.ts (precise terminal-level boundary)

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

export interface DetectionZone {
  id: string;
  name: string;
  lat: number;   // centre point (fallback only)
  lng: number;
  radiusKm: number; // fallback radius if polygon absent
  fee: number;
  penaltyFee: number;
  payUrl: string;
  type: 'INNER';
  // Precise polygon boundary — [lat, lng] pairs, clockwise or CCW
  polygon: [number, number][];
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

// ─── CCZ config (used by dropoffDetection for daily charge logic) ─────────────
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

// ─── Display zones (UI cards, distance calculations) ──────────────────────────
export const DISPLAY_ZONES: DisplayZone[] = [
  {
    id: 'heathrow',
    name: 'Heathrow Airport',
    shortName: 'Heathrow',
    emoji: '✈️',
    lat: 51.4700,
    lng: -0.4543,
    radiusKm: 0.8,
    fee: 7,
    penaltyFee: 80,
    chargeType: 'per_entry',
    note: '£7 per entry · max 10min',
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
  },
  {
    id: 'gatwick',
    name: 'Gatwick Airport',
    shortName: 'Gatwick',
    emoji: '✈️',
    lat: 51.1537,
    lng: -0.1821,
    radiusKm: 0.8,
    fee: 10,
    penaltyFee: 100,
    chargeType: 'per_entry',
    note: '£10 per entry · max 10min',
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off/pay-drop-off-charge/',
  },
  {
    id: 'stansted',
    name: 'Stansted Airport',
    shortName: 'Stansted',
    emoji: '✈️',
    lat: 51.8850,
    lng: 0.2628,
    radiusKm: 0.8,
    fee: 10,
    penaltyFee: 100,
    chargeType: 'by_duration',
    note: '0–15min: £10 · 15–30min: £28',
    payUrl: 'https://www.stanstedairport.com/parking/express-set-down/',
  },
  {
    id: 'luton',
    name: 'Luton Airport',
    shortName: 'Luton',
    emoji: '✈️',
    lat: 51.8747,
    lng: -0.3683,
    radiusKm: 0.8,
    fee: 7,
    penaltyFee: 95,
    chargeType: 'by_duration',
    note: '0–10min: £7 · +£1/min after',
    payUrl: 'https://lutondropoff.apcoa.com/latepaysearch/vrnsearch',
  },
  {
    id: 'london_city',
    name: 'London City Airport',
    shortName: 'London City',
    emoji: '✈️',
    lat: 51.5048,
    lng: 0.0495,
    radiusKm: 0.6,
    fee: 8,
    penaltyFee: 80,
    chargeType: 'by_duration',
    note: '0–5min: £8 · +£1/min after',
    payUrl: 'https://www.londoncityairport.com/to-and-from-the-airport/by-car/drop-off-charge/',
  },
  {
    id: 'ccz',
    name: 'Congestion Charge Zone',
    shortName: 'CCZ',
    emoji: '🚧',
    lat: 51.5155,
    lng: -0.1100,
    radiusKm: 2.8,
    fee: 15,
    penaltyFee: 160,
    chargeType: 'daily',
    note: '£15/day · Mon–Fri 07:00–18:00',
    payUrl: 'https://tfl.gov.uk/modes/driving/congestion-charge/pay-or-register-a-congestion-charge',
  },
  {
    id: 'ulez',
    name: 'Ultra Low Emission Zone',
    shortName: 'ULEZ',
    emoji: '♻️',
    lat: 51.5074,
    lng: -0.1278,
    radiusKm: 18.0,
    fee: 12.5,
    penaltyFee: 180,
    chargeType: 'daily',
    note: '£12.50/day · 24/7',
    payUrl: 'https://tfl.gov.uk/modes/driving/ultra-low-emission-zone/check-if-you-need-to-pay',
  },
];

// ─── Detection zones (precise terminal-level, polygon boundaries) ─────────────
// Polygons are [lat, lng] pairs tracing the actual drop-off road boundary.
// Use Google Maps satellite view to refine these if needed.
export const DETECTION_ZONES: DetectionZone[] = [
  {
    id: 'heathrow_t2', name: 'Heathrow T2',
    lat: 51.4697, lng: -0.4522, radiusKm: 0.18,
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    type: 'INNER',
    polygon: [
      [51.4706, -0.4542], [51.4706, -0.4503],
      [51.4689, -0.4503], [51.4689, -0.4542],
    ],
  },
  {
    id: 'heathrow_t3', name: 'Heathrow T3',
    lat: 51.4705, lng: -0.4571, radiusKm: 0.18,
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    type: 'INNER',
    polygon: [
      [51.4713, -0.4592], [51.4713, -0.4551],
      [51.4696, -0.4551], [51.4696, -0.4592],
    ],
  },
  {
    id: 'heathrow_t4', name: 'Heathrow T4',
    lat: 51.4582, lng: -0.4455, radiusKm: 0.18,
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    type: 'INNER',
    polygon: [
      [51.4591, -0.4476], [51.4591, -0.4434],
      [51.4573, -0.4434], [51.4573, -0.4476],
    ],
  },
  {
    id: 'heathrow_t5', name: 'Heathrow T5',
    lat: 51.4722, lng: -0.4891, radiusKm: 0.18,
    fee: 7, penaltyFee: 80,
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
    type: 'INNER',
    polygon: [
      [51.4731, -0.4912], [51.4731, -0.4870],
      [51.4713, -0.4870], [51.4713, -0.4912],
    ],
  },
  {
    id: 'gatwick_north', name: 'Gatwick North',
    lat: 51.1618, lng: -0.1762, radiusKm: 0.20,
    fee: 10, penaltyFee: 100,
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off',
    type: 'INNER',
    polygon: [
      [51.1628, -0.1787], [51.1628, -0.1738],
      [51.1608, -0.1738], [51.1608, -0.1787],
    ],
  },
  {
    id: 'gatwick_south', name: 'Gatwick South',
    lat: 51.1565, lng: -0.1595, radiusKm: 0.20,
    fee: 10, penaltyFee: 100,
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off',
    type: 'INNER',
    polygon: [
      [51.1575, -0.1620], [51.1575, -0.1570],
      [51.1555, -0.1570], [51.1555, -0.1620],
    ],
  },
  {
    id: 'stansted', name: 'Stansted',
    lat: 51.8896, lng: 0.2628, radiusKm: 0.22,
    fee: 10, penaltyFee: 100,
    payUrl: 'https://pay.stanstedairport.com',
    type: 'INNER',
    polygon: [
      [51.8908, 0.2598], [51.8908, 0.2658],
      [51.8884, 0.2658], [51.8884, 0.2598],
    ],
  },
  {
    id: 'luton', name: 'Luton',
    lat: 51.8761, lng: -0.3713, radiusKm: 0.22,
    fee: 7, penaltyFee: 95,
    payUrl: 'https://lutondropoff.apcoa.com/latepaysearch/vrnsearch',
    type: 'INNER',
    polygon: [
      [51.8772, -0.3740], [51.8772, -0.3686],
      [51.8750, -0.3686], [51.8750, -0.3740],
    ],
  },
  {
    id: 'london_city', name: 'London City',
    lat: 51.5032, lng: 0.0488, radiusKm: 0.18,
    fee: 8, penaltyFee: 80,
    payUrl: 'https://www.londoncityairport.com',
    type: 'INNER',
    polygon: [
      [51.5041, 0.0463], [51.5041, 0.0513],
      [51.5023, 0.0513], [51.5023, 0.0463],
    ],
  },
];
