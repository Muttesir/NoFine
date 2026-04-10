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
    Location.getCurrentPositionAsync({}).then(loc => setCoords(loc.coords)).catch(() => {});
  }, []);

  const sorted = [...ZONES].sort((a, b) => {
    if (!coords) return 0;
    return haversine(coords.latitude, coords.longitude, a.lat, a.lng) - haversine(coords.latitude, coords.longitude, b.lat, b.lng);
  });

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>LIVE TRACKING</Text>
        <View style={[s.badge, { backgroundColor: gpsEnabled ? COLORS.greenDim : COLORS.surface }]}>
          <Text style={[s.badgeText, { color: gpsEnabled ? COLORS.green : COLORS.muted }]}>
            {gpsEnabled ? '● GPS On' : '● GPS Off'}
          </Text>
        </View>
      </View>
      <ScrollView style={s.scroll}>
        {sorted.map(zone => {
          const dist = coords ? haversine(coords.latitude, coords.longitude, zone.lat, zone.lng) : null;
          const distText = dist === null ? 'Locating...' : dist < 1 ? `${Math.round(dist*1000)}m` : `${dist.toFixed(1)}km`;
          return (
            <View key={zone.id} style={s.row}>
              <Text style={{ fontSize: 22, width: 36 }}>{zone.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.zoneName}>{zone.shortName}</Text>
                <Text style={s.zoneDist}>{distText} away</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: COLORS.green, fontWeight: '700' }}>● Clear</Text>
                <Text style={s.zoneFee}>£{zone.fee}</Text>
              </View>
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
  badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  badgeText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  zoneName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  zoneDist: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  zoneFee: { fontSize: 16, fontWeight: '800', color: COLORS.muted, marginTop: 2 },
});
