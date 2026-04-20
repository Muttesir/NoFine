import AsyncStorage from '@react-native-async-storage/async-storage';

export const GPSState = {
  get: async (): Promise<boolean> => {
    const v = await AsyncStorage.getItem('nf_gps');
    return v !== 'false';
  },
  set: async (val: boolean): Promise<void> => {
    await AsyncStorage.setItem('nf_gps', val ? 'true' : 'false');
  },
};
