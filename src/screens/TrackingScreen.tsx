import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import * as Location from 'expo-location';
import { COLORS, ZONES } from '../services/api';
import { UserData } from '../services/storage';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default function TrackingScreen({ user, gpsEnabled }: { user: UserData; gpsEnabled: boolean }) {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let sub: any;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (loc) => setCoords(loc.coords)
      );
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  const zones = ZONES.filter(z => z && z.id);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>LIVE TRACKING</Text>
        <View style={[s.gpsBadge, { backgroundColor: gpsEnabled ? '#0d1a0d' : '#2a0000' }]}>
          <Text style={[s.gpsText, { color: gpsEnabled ? COLORS.green : COLORS.red }]}>
            {gpsEnabled ? '● GPS On' : '● GPS Off'}
          </Text>
        </View>
      </View>
      <ScrollView style={s.scroll}>
        {zones.map(zone => {
          if (!zone) return null;
          const dist = coords ? haversine(coords.latitude, coords.longitude, zone.lat, zone.lng) : null;
          const distMiles = dist !== null ? (dist * 0.621371).toFixed(1) : null;
          return (
            <View key={zone.id} style={s.zoneCard}>
              <View style={s.zoneLeft}>
                <Text style={s.zoneName}>{zone.name || zone.shortName}</Text>
                <Text style={s.zoneDist}>{distMiles ? `${distMiles} miles away` : 'Locating...'}</Text>
              </View>
              <Text style={s.zoneFee}>£{zone.fee}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  gpsBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#1a3a1a' },
  gpsText: { fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1, padding: 16 },
  zoneCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  zoneLeft: { flex: 1 },
  zoneName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  zoneDist: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  zoneFee: { fontSize: 16, fontWeight: '800', color: COLORS.amber },
});
