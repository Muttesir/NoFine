import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import * as Location from 'expo-location';

import { COLORS } from '../services/api';
import { DISPLAY_ZONES } from '../services/zones';
import { UserData } from '../services/storage';
import { haversineKm } from '../utils/distance';

export default function TrackingScreen({
  user,
  gpsEnabled,
}: {
  user: UserData;
  gpsEnabled: boolean;
}) {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
        loc => setCoords(loc.coords),
      );
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  const getDist = (lat: number, lng: number): number | null => {
    if (!coords) return null;
    return haversineKm(coords.latitude, coords.longitude, lat, lng) * 0.621371; // km→miles
  };

  const sorted = [...DISPLAY_ZONES].sort((a, b) => {
    const da = getDist(a.lat, a.lng) ?? 999;
    const db = getDist(b.lat, b.lng) ?? 999;
    return da - db;
  });

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>LIVE TRACKING</Text>
        <View style={[s.gpsBadge, { backgroundColor: gpsEnabled ? '#0d1a0d' : COLORS.redDim }]}>
          <View style={[s.gpsDot, { backgroundColor: gpsEnabled ? COLORS.green : COLORS.red }]} />
          <Text style={[s.gpsText, { color: gpsEnabled ? COLORS.green : COLORS.red }]}>
            GPS {gpsEnabled ? 'On' : 'Off'}
          </Text>
        </View>
      </View>

      {/* GPS coords strip */}
      {gpsEnabled && coords && (
        <View style={s.coordStrip}>
          <CoordStat label="Lat"  value={`${coords.latitude.toFixed(4)}°`} />
          <View style={s.coordDiv} />
          <CoordStat label="Lng"  value={`${coords.longitude.toFixed(4)}°`} />
          <View style={s.coordDiv} />
          <CoordStat label="Acc"  value="±8 m" />
        </View>
      )}

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {sorted.map(zone => {
          const distMiles = getDist(zone.lat, zone.lng);
          const isNear    = distMiles !== null && distMiles < 5;
          const distText  = distMiles === null
            ? 'Locating…'
            : distMiles < 0.1
              ? `${Math.round(distMiles * 5280)} ft away`
              : `${distMiles.toFixed(1)} miles away`;

          return (
            <View key={zone.id} style={[s.zoneRow, isNear && s.zoneRowNear]}>
              <View style={s.zoneLeft}>
                <View style={s.zoneIcon}>
                  <Text style={{ fontSize: 18 }}>{zone.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.zoneName}>{zone.name}</Text>
                  <Text style={[s.zoneDist, isNear && { color: COLORS.amber }]}>{distText}</Text>
                </View>
              </View>
              <View style={s.zoneRight}>
                <Text style={s.zoneFee}>£{zone.fee}</Text>
                <View style={[s.dot, { backgroundColor: isNear ? COLORS.amber : COLORS.green }]} />
              </View>
            </View>
          );
        })}

        {!gpsEnabled && (
          <View style={s.offState}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>📍</Text>
            <Text style={s.offTitle}>GPS is off</Text>
            <Text style={s.offSub}>Enable GPS on the Home screen to see live distances</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CoordStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 0.8, marginBottom: 3, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 11, color: COLORS.green, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.bg },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title:       { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  gpsBadge:    { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#1a3a1a' },
  gpsDot:      { width: 7, height: 7, borderRadius: 4 },
  gpsText:     { fontSize: 12, fontWeight: '700' },

  coordStrip:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1a0d', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.green + '30', paddingVertical: 12, paddingHorizontal: 20, marginBottom: 4 },
  coordDiv:    { width: 1, height: 28, backgroundColor: COLORS.border },

  scroll:      { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  zoneRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  zoneRowNear: { backgroundColor: '#1a1200', borderColor: COLORS.amber + '55' },
  zoneLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  zoneIcon:    { width: 40, height: 40, backgroundColor: COLORS.surface2, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  zoneName:    { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  zoneDist:    { fontSize: 12, color: COLORS.muted },
  zoneRight:   { alignItems: 'flex-end', gap: 6 },
  zoneFee:     { fontSize: 16, fontWeight: '800', color: COLORS.amber },
  dot:         { width: 8, height: 8, borderRadius: 4 },

  offState:    { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  offTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.muted, marginBottom: 8 },
  offSub:      { fontSize: 13, color: COLORS.dim, textAlign: 'center', lineHeight: 20 },
});
