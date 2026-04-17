export const BASE_URL = 'https://nofine-production.up.railway.app';

export const COLORS = {
  bg: '#0a0c12', surface: '#13151e', surface2: '#1a1c24', border: '#1f2130',
  text: '#ffffff', muted: '#687090', dim: '#343A52',
  green: '#1DB954', greenDim: '#0d1a0d',
  amber: '#F5A623', amberDim: '#1a1400',
  red: '#FF3B55', redDim: '#2a0000', blue: '#3B82F6',
};

export const API = {
  dvlaLookup: async (plate: string) => {
    const r = await fetch(`${BASE_URL}/api/dvla/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plate }) });
    return r.json();
  },
  zoneEntry: async (plate: string, zoneId: string) => {
    const r = await fetch(`${BASE_URL}/api/zone-entry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plate, zoneId }) });
    return r.json();
  },
  zoneExit: async (plate: string, zoneId: string) => {
    const r = await fetch(`${BASE_URL}/api/zone-exit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plate, zoneId }) });
    return r.json();
  },
};

export const ZONES = [
  {
    id: 'heathrow', name: 'Heathrow Airport', shortName: 'Heathrow', emoji: '✈️',
    lat: 51.4700, lng: -0.4543, radiusKm: 0.8, fee: 7, penaltyFee: 80, chargeType: 'per_entry',
    note: '£7 per entry · max 10min',
    payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',
  },
  {
    id: 'gatwick', name: 'Gatwick Airport', shortName: 'Gatwick', emoji: '✈️',
    lat: 51.1537, lng: -0.1821, radiusKm: 0.8, fee: 10, penaltyFee: 100, chargeType: 'per_entry',
    note: '£10 per entry · max 10min',
    payUrl: 'https://www.gatwickairport.com/transport-options/drop-off/pay-drop-off-charge/',
  },
  {
    id: 'stansted', name: 'Stansted Airport', shortName: 'Stansted', emoji: '✈️',
    lat: 51.8850, lng: 0.2342, radiusKm: 0.8, fee: 10, penaltyFee: 100, chargeType: 'by_duration',
    note: '0–15min: £10 · 15–30min: £28',
    payUrl: 'https://www.stanstedairport.com/parking/express-set-down/',
  },
  {
    id: 'luton', name: 'Luton Airport', shortName: 'Luton', emoji: '✈️',
    lat: 51.8747, lng: -0.3683, radiusKm: 0.8, fee: 7, penaltyFee: 95, chargeType: 'by_duration',
    note: '0–10min: £7 · +£1/min after',
    payUrl: 'https://lutondropoff.apcoa.com/latepaysearch/vrnsearch',
  },
  {
    id: 'london_city', name: 'London City Airport', shortName: 'London City', emoji: '✈️',
    lat: 51.5048, lng: 0.0495, radiusKm: 0.6, fee: 8, penaltyFee: 80, chargeType: 'by_duration',
    note: '0–5min: £8 · +£1/min after',
    payUrl: 'https://www.londoncityairport.com/to-and-from-the-airport/by-car/drop-off-charge/',
  },
  {
    id: 'ccz', name: 'Congestion Charge Zone', shortName: 'CCZ', emoji: '🚧',
    lat: 51.5155, lng: -0.1100, radiusKm: 2.8, fee: 15, penaltyFee: 160, chargeType: 'daily',
    note: '£15/day · Mon–Fri 07:00–18:00',
    payUrl: 'https://tfl.gov.uk/modes/driving/congestion-charge/pay-or-register-a-congestion-charge',
  },
  {
    id: 'ulez', name: 'Ultra Low Emission Zone', shortName: 'ULEZ', emoji: '♻️',
    lat: 51.5074, lng: -0.1278, radiusKm: 18.0, fee: 12.5, penaltyFee: 180, chargeType: 'daily',
    note: '£12.50/day · 24/7',
    payUrl: 'https://tfl.gov.uk/modes/driving/ultra-low-emission-zone/check-if-you-need-to-pay',
  },
  ,
];

export const DROPOFF_ZONES = [
  { id: "heathrow_t2", name: "Heathrow T2", lat: 51.4697, lng: -0.4522, radiusKm: 0.18, fee: 7, penaltyFee: 80, payUrl: "https://heathrowdropoff.apcoa.com/trip/vrn", type: "INNER" },
  { id: "heathrow_t3", name: "Heathrow T3", lat: 51.4705, lng: -0.4571, radiusKm: 0.18, fee: 7, penaltyFee: 80, payUrl: "https://heathrowdropoff.apcoa.com/trip/vrn", type: "INNER" },
  { id: "heathrow_t4", name: "Heathrow T4", lat: 51.4582, lng: -0.4455, radiusKm: 0.18, fee: 7, penaltyFee: 80, payUrl: "https://heathrowdropoff.apcoa.com/trip/vrn", type: "INNER" },
  { id: "heathrow_t5", name: "Heathrow T5", lat: 51.4722, lng: -0.4891, radiusKm: 0.18, fee: 7, penaltyFee: 80, payUrl: "https://heathrowdropoff.apcoa.com/trip/vrn", type: "INNER" },
  { id: "gatwick_north", name: "Gatwick North", lat: 51.1618, lng: -0.1762, radiusKm: 0.2, fee: 10, penaltyFee: 100, payUrl: "https://www.gatwickairport.com/transport-options/drop-off", type: "INNER" },
  { id: "gatwick_south", name: "Gatwick South", lat: 51.1565, lng: -0.1595, radiusKm: 0.2, fee: 10, penaltyFee: 100, payUrl: "https://www.gatwickairport.com/transport-options/drop-off", type: "INNER" },
  { id: "stansted", name: "Stansted", lat: 51.8896, lng: 0.2628, radiusKm: 0.22, fee: 10, penaltyFee: 100, payUrl: "https://pay.stanstedairport.com", type: "INNER" },
  { id: "luton", name: "Luton", lat: 51.8761, lng: -0.3713, radiusKm: 0.22, fee: 7, penaltyFee: 95, payUrl: "https://lutondropoff.apcoa.com/latepaysearch/vrnsearch", type: "INNER" },
  { id: "london_city", name: "London City", lat: 51.5032, lng: 0.0488, radiusKm: 0.18, fee: 8, penaltyFee: 80, payUrl: "https://www.londoncityairport.com", type: "INNER" },
];
