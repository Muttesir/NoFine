import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'dropoff_points';

export interface DropoffPoint {
  lat: number;
  lng: number;
  airport: string;
  terminal: string | null;
  duration: number;       // minutes
  timestamp: string;      // ISO
  entryLat?: number;
  entryLng?: number;
}

export async function saveDropoffPoint(point: DropoffPoint): Promise<void> {
  const all = await getDropoffPoints();
  all.push(point);
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

export async function getDropoffPoints(): Promise<DropoffPoint[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as DropoffPoint[]; } catch { return []; }
}

/** Parses zoneId → [AIRPORT, TERMINAL | null] */
export function parseZoneId(zoneId: string): [string, string | null] {
  if (zoneId.startsWith('heathrow_')) return ['HEATHROW', zoneId.replace('heathrow_', '').toUpperCase()];
  if (zoneId.startsWith('gatwick_'))  return ['GATWICK',  zoneId.replace('gatwick_', '').toUpperCase()];
  if (zoneId === 'stansted')    return ['STANSTED',    null];
  if (zoneId === 'luton')       return ['LUTON',       null];
  if (zoneId === 'london_city') return ['LONDON_CITY', null];
  return [zoneId.toUpperCase(), null];
}
