import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Linking } from 'react-native';
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

function isChargeActive(zoneId: string): boolean {
  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();
  if (zoneId === 'ccz') {
    if (day === 0) return false;
    if (day === 6) return time >= 720 && time < 1080;
    return time >= 420 && time < 1080;
  }
  if (zoneId.startsWith('oxford')) {
    const peakOnly = zoneId === 'oxford_ccz_marston' || zoneId === 'oxford_ccz_hollow';
    if (peakOnly) {
      if (day === 0) return false;
      return (time >= 420 && time < 540) || (time >= 900 && time < 1080);
    }
    return time >= 420 && time < 1140;
  }
  return true;
}

const OXFORD_ZONES = ZONES.filter(z => z && z.id && z.id.startsWith('oxford'));
const LONDON_ZONES = ZONES.filter(z => z && z.id && !z.id.startsWith('oxford'));

export default function TrackingScreen({ user, gpsEnabled }: { user: UserData; gpsEnabled: boolean }) {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    Location.getCurrentPositionAsync({}).then(loc => setCoords(loc.coords)).catch(() => {});
    const t = setInterval(() => {
      Location.getCurrentPositionAsync({}).then(loc => setCoords(loc.coords)).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const getDist = (lat: number, lng: number) => {
    if (!coords) return null;
    return haversine(coords.latitude, coords.longitude, lat, lng);
  };

  const sortedLondon = [...LONDON_ZONES].sort((a, b) =>
    (getDist(a.lat, a.lng) ?? 999) - (getDist(b.lat, b.lng) ?? 999)
  );

  const oxfordDist = coords ? Math.min(...OXFORD_ZONES.map(z => haversine(coords.latitude, coords.longitude, z.lat, z.lng))) : null;
  const oxfordActive = OXFORD_ZONES.some(z => isChargeActive(z.id));

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

        {/* Oxford — tek kart */}
        <Text style={s.sectionLabel}>OXFORD</Text>
        <TouchableOpacity
          style={s.oxfordCard}
          onPress={() => Linking.openURL('https://www.oxfordshire.gov.uk/transport-and-travel/oxfords-temporary-congestion-charge-cars/pay-congestion-charge')}
        >
          <View style={s.oxfordLeft}>
            <Text style={s.emoji}>🚦</Text>
            <View>
              <Text style={s.zoneName}>Oxford Congestion & ZEZ</Text>
              <Text style={s.zoneDist}>
                {oxfordDist !== null ? `${oxfordDist.toFixed(1)}km away` : 'Locating...'}
              </Text>
              <Text style={[s.zoneStatus, { color: oxfordActive ? COLORS.amber : COLORS.muted }]}>
                {oxfordActive ? '● Charge active now' : '● No charge now'}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.zoneFee, { color: oxfordActive ? COLORS.amber : COLORS.muted }]}>£5</Text>
            <Text style={s.payText}>Pay →</Text>
          </View>
        </TouchableOpacity>
        <Text style={s.hint}>GPS monitors 6 CCZ points + ZEZ automatically</Text>

        {/* London */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>LONDON</Text>
        {sortedLondon.map(zone => {
          const dist = getDist(zone.lat, zone.lng);
          const distText = dist === null ? 'Locating...' : dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
          const active = isChargeActive(zone.id);
          return (
            <View key={zone.id} style={s.row}>
              <Text style={s.emoji}>{zone.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.zoneName}>{zone.shortName}</Text>
                <Text style={s.zoneDist}>{distText} away</Text>
                <Text style={[s.zoneStatus, { color: active ? COLORS.amber : COLORS.muted }]}>
                  {active ? '● Charge active' : '● No charge now'}
                </Text>
              </View>
              <Text style={[s.zoneFee, { color: active ? COLORS.amber : COLORS.muted }]}>£{zone.fee}</Text>
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
  sectionLabel: { fontSize: 10, fontWeight: '700', color: COLORS.dim, letterSpacing: 2, marginBottom: 8 },
  oxfordCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  oxfordLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  hint: { fontSize: 11, color: COLORS.dim, textAlign: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  emoji: { fontSize: 22, width: 36 },
  zoneName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  zoneDist: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  zoneStatus: { fontSize: 10, fontWeight: '700', marginTop: 3 },
  zoneFee: { fontSize: 16, fontWeight: '800' },
  payText: { fontSize: 12, color: COLORS.blue, marginTop: 4 },
});
