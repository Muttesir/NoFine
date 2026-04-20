import AsyncStorage from '@react-native-async-storage/async-storage';
import { DetectionZone } from './zones';

export interface UserData {
  name: string;
  plate: string;
  make?: string;
  model?: string;
  colour?: string;
  year?: number;
  extraPlates?: { plate: string; make?: string; model?: string; colour?: string }[];
}

export interface Charge {
  id: string;
  zoneId: string;
  zoneName: string;
  plate: string;
  enteredAt: string;
  exitedAt?: string;
  durationMinutes?: number;
  fee: number;
  penaltyFee: number;
  deadline: string;
  payUrl: string;
  paid: boolean;
  paidAt?: string;
  paymentMethod?: string;
}

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

export interface GPSState {
  isInsideZone: boolean;
  currentZone: DetectionZone | null;
  entryTime: number | null;
  entryCandidateAt: number | null;
  exitCandidateAt: number | null;
  cooldownUntil: number;
  cczIsInside: boolean;
  cczChargedDate: string | null;
}

const K = {
  user: 'nf_user',
  charges: 'nf_charges',
  history: 'nf_history',
  pendingVisit: 'nf_pending_visit',
  gpsState: 'nf_gps_state',
} as const;

export const Storage = {
  getUser: async (): Promise<UserData | null> => {
    const r = await AsyncStorage.getItem(K.user);
    return r ? (JSON.parse(r) as UserData) : null;
  },

  saveUser: async (d: UserData): Promise<void> => {
    await AsyncStorage.setItem(K.user, JSON.stringify(d));
  },

  getCharges: async (): Promise<Charge[]> => {
    const r = await AsyncStorage.getItem(K.charges);
    return r ? (JSON.parse(r) as Charge[]) : [];
  },

  saveCharges: async (c: Charge[]): Promise<void> => {
    await AsyncStorage.setItem(K.charges, JSON.stringify(c));
  },

  getHistory: async (): Promise<Charge[]> => {
    const r = await AsyncStorage.getItem(K.history);
    return r ? (JSON.parse(r) as Charge[]) : [];
  },

  addToHistory: async (c: Charge): Promise<void> => {
    const h = await Storage.getHistory();
    h.unshift(c);
    await AsyncStorage.setItem(K.history, JSON.stringify(h.slice(0, 100)));
  },

  getPendingVisit: async (): Promise<DropoffVisit | null> => {
    const r = await AsyncStorage.getItem(K.pendingVisit);
    return r ? (JSON.parse(r) as DropoffVisit) : null;
  },

  savePendingVisit: async (v: DropoffVisit): Promise<void> => {
    await AsyncStorage.setItem(K.pendingVisit, JSON.stringify(v));
  },

  clearPendingVisit: async (): Promise<void> => {
    await AsyncStorage.removeItem(K.pendingVisit);
  },

  getGPSState: async (): Promise<GPSState | null> => {
    const r = await AsyncStorage.getItem(K.gpsState);
    return r ? (JSON.parse(r) as GPSState) : null;
  },

  saveGPSState: async (s: GPSState): Promise<void> => {
    await AsyncStorage.setItem(K.gpsState, JSON.stringify(s));
  },

  clearGPSState: async (): Promise<void> => {
    await AsyncStorage.removeItem(K.gpsState);
  },

  clearAll: async (): Promise<void> => {
    await AsyncStorage.multiRemove(Object.values(K));
  },
};
