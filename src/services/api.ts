import { DISPLAY_ZONES, DETECTION_ZONES, DisplayZone, DetectionZone } from './zones';

export const BASE_URL = 'https://nofine-production.up.railway.app';

export const COLORS = {
  bg: '#0a0c12', surface: '#13151e', surface2: '#1a1c24', border: '#1f2130',
  text: '#ffffff', muted: '#687090', dim: '#343A52',
  green: '#1DB954', greenDim: '#0d1a0d',
  amber: '#F5A623', amberDim: '#1a1400',
  red: '#FF3B55', redDim: '#2a0000', blue: '#3B82F6',
};

// Re-export zone lists so existing imports don't need to change
export const ZONES: DisplayZone[] = DISPLAY_ZONES;
export const DROPOFF_ZONES: DetectionZone[] = DETECTION_ZONES;
export type { DisplayZone, DetectionZone };

export const API = {
  dvlaLookup: async (plate: string): Promise<Record<string, unknown>> => {
    const r = await fetch(`${BASE_URL}/api/dvla/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate }),
    });
    return r.json();
  },

  zoneEntry: async (plate: string, zoneId: string): Promise<Record<string, unknown>> => {
    const r = await fetch(`${BASE_URL}/api/zone-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate, zoneId }),
    });
    return r.json();
  },

  zoneExit: async (plate: string, zoneId: string): Promise<Record<string, unknown>> => {
    const r = await fetch(`${BASE_URL}/api/zone-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate, zoneId }),
    });
    return r.json();
  },
};
