import AsyncStorage from '@react-native-async-storage/async-storage';
export interface UserData { name: string; plate: string; make?: string; model?: string; colour?: string; year?: number; extraPlates?: { plate: string; make?: string; model?: string; colour?: string }[]; }
export interface Charge { id: string; zoneId: string; zoneName: string; plate: string; enteredAt: string; exitedAt?: string; durationMinutes?: number; fee: number; penaltyFee: number; deadline: string; payUrl: string; paid: boolean; paidAt?: string; paymentMethod?: string; }
const K = { user: 'nf_user', charges: 'nf_charges', history: 'nf_history' };
export const Storage = {
  getUser: async (): Promise<UserData | null> => { const r = await AsyncStorage.getItem(K.user); return r ? JSON.parse(r) : null; },
  saveUser: async (d: UserData) => AsyncStorage.setItem(K.user, JSON.stringify(d)),
  getCharges: async (): Promise<Charge[]> => { const r = await AsyncStorage.getItem(K.charges); return r ? JSON.parse(r) : []; },
  saveCharges: async (c: Charge[]) => AsyncStorage.setItem(K.charges, JSON.stringify(c)),
  getHistory: async (): Promise<Charge[]> => { const r = await AsyncStorage.getItem(K.history); return r ? JSON.parse(r) : []; },
  addToHistory: async (c: Charge) => { const h = await Storage.getHistory(); h.unshift(c); await AsyncStorage.setItem(K.history, JSON.stringify(h.slice(0, 100))); },
  clearAll: async () => AsyncStorage.multiRemove(Object.values(K)),
};
