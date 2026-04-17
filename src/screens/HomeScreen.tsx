import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl, Linking, Switch } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Storage, UserData, Charge } from '../services/storage';
import { COLORS, ZONES } from '../services/api';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const LONDON_ZONES = ZONES.filter(z => z && z.id);

export default function HomeScreen({ user, onOpenSettings, gpsEnabled, onToggleGPS }: { user: UserData; onOpenSettings: () => void; gpsEnabled: boolean; onToggleGPS: () => void }) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const load = useCallback(async () => {
    const c = await Storage.getCharges();
    setCharges(c);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    Location.getCurrentPositionAsync({}).then(loc => setCoords(loc.coords)).catch(() => {});
    return () => clearInterval(t);
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const unpaid = charges.filter(c => !c.paid);

  const getDist = (lat: number, lng: number) => {
    if (!coords) return null;
    return haversine(coords.latitude, coords.longitude, lat, lng);
  };

  const sortedLondon = [...LONDON_ZONES].sort((a, b) => {
    const da = getDist(a.lat, a.lng) ?? 999;
    const db = getDist(b.lat, b.lng) ?? 999;
    return da - db;
  });


  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.green} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <View>
            <Text style={s.welcome}>Welcome back,</Text>
            <Text style={s.name}>{user.name}</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.plateBox} onPress={onOpenSettings}>
              <Text style={s.plate}>{user.plate}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.settingsBtn} onPress={onOpenSettings}>
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.pad}>
          {unpaid.length === 0 ? (
            <View style={s.clearCard}>
              <View style={s.clearIconBox}><Text style={{ fontSize: 32 }}>✅</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.clearTitle}>All Clear</Text>
                <Text style={s.clearSub}>No unpaid charges · Safe to drive</Text>
              </View>
            </View>
          ) : (
            unpaid.map(c => <ChargeCard key={c.id} charge={c} onPaid={load} />)
          )}

          <View style={s.statsRow}>
            <StatBox label="Penalties Avoided" value={`£${charges.filter(c => c.paid).reduce((s,c) => s+c.penaltyFee, 0).toFixed(0)}`} color={COLORS.green} />
            <StatBox label="This Month" value={`${charges.filter(c => new Date(c.enteredAt).getMonth() === new Date().getMonth()).length}`} color={COLORS.blue} />
            <StatBox label="Overdue" value={`${unpaid.filter(c => new Date(c.deadline).getTime() < Date.now()).length}`} color={COLORS.red} />
          </View>

          {/* GPS Toggle */}
          <View style={s.gpsRow}>
            <View>
              <Text style={s.gpsLabel}>GPS Monitoring</Text>
              <Text style={s.gpsSub}>Detect charge zones automatically</Text>
            </View>
            <Switch
              value={gpsEnabled}
              onValueChange={onToggleGPS}
              trackColor={{ false: COLORS.surface2, true: COLORS.green }}
              thumbColor={'#fff'}
            />
          </View>

          {/* London Zones */}
          <Text style={[s.sectionTitle, { marginBottom: 12 }]}>London Zones</Text>
          <View style={s.zoneGrid}>
            {sortedLondon.map(z => {
              const dist = getDist(z.lat, z.lng);
              const distText = dist === null ? '...' : dist < 1 ? `${Math.round(dist * 1609)}ft` : `${(dist * 0.621371).toFixed(1)} miles`;
              const isNear = dist !== null && dist < 5;
              return (
                <View key={z.id} style={[s.zoneCard, isNear && s.zoneCardNear]}>
                  <View style={s.zoneCardTop}>
                    <Text style={s.zoneEmoji}>{z.emoji}</Text>
                    <View style={[s.zoneDot, { backgroundColor: isNear ? COLORS.amber : COLORS.green }]} />
                  </View>
                  <Text style={s.zoneCardName}>{z.shortName}</Text>
                  <Text style={s.zoneCardFee}>£{z.fee}</Text>
                  <Text style={s.zoneCardDist}>{distText} away</Text>
                </View>
              );
            })}
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChargeCard({ charge, onPaid }: { charge: Charge; onPaid: () => void }) {
  const remaining = new Date(charge.deadline).getTime() - Date.now();
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const urgent = remaining < 3600000;
  return (
    <View style={[s.chargeCard, urgent && s.chargeUrgent]}>
      <View style={s.chargeTop}>
        <View>
          <Text style={s.chargeZone}>{charge.zoneName}</Text>
          <Text style={[s.chargeTimer, urgent && { color: COLORS.red }]}>
            {urgent ? '🚨 ' : '⏰ '}{hours}h {mins}min left
          </Text>
        </View>
        <Text style={[s.chargeFee, urgent && { color: COLORS.red }]}>£{charge.fee.toFixed(2)}</Text>
      </View>
      <TouchableOpacity style={s.appleBtn}>
        <Text style={s.appleBtnText}>Pay with Apple Pay</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.paidBtn} onPress={async () => { const all = await Storage.getCharges(); const updated = all.map((c: Charge) => c.id === charge.id ? { ...c, paid: true, paidAt: new Date().toISOString() } : c); await Storage.saveCharges(updated); await Storage.addToHistory({ ...charge, paid: true, paidAt: new Date().toISOString() }); const remaining = updated.filter((c: Charge) => !c.paid).length; await Notifications.setBadgeCountAsync(remaining);
onPaid(); }}>
        <Text style={s.paidBtnText}>✅ Mark as Paid</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.portalBtn} onPress={() => Linking.openURL(charge.payUrl)}>
        <Text style={s.portalBtnText}>Open Payment Portal →</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  welcome: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  name: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plateBox: { backgroundColor: COLORS.amberDim, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.amber + '44' },
  plate: { fontSize: 14, fontWeight: '800', color: COLORS.amber, letterSpacing: 1.5 },
  settingsBtn: { width: 40, height: 40, backgroundColor: COLORS.surface, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  pad: { padding: 16 },
  clearCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: COLORS.greenDim, borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.green + '33' },
  clearIconBox: { width: 56, height: 56, backgroundColor: COLORS.green + '22', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  clearTitle: { fontSize: 20, fontWeight: '800', color: COLORS.green },
  clearSub: { fontSize: 13, color: COLORS.muted, marginTop: 3 },
  chargeCard: { backgroundColor: '#1c0e00', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1.5, borderColor: COLORS.amber + '55' },
  chargeUrgent: { backgroundColor: '#1c0000', borderColor: COLORS.red + '66' },
  chargeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  chargeZone: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  chargeTimer: { fontSize: 13, color: COLORS.amber, marginTop: 4 },
  chargeFee: { fontSize: 36, fontWeight: '900', color: COLORS.amber },
  appleBtn: { backgroundColor: '#000', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  appleBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  paidBtn: { backgroundColor: COLORS.greenDim, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: COLORS.green + '44' },
  paidBtnText: { color: COLORS.green, fontWeight: '800', fontSize: 15 },
  portalBtn: { padding: 10, alignItems: 'center' },
  portalBtnText: { color: COLORS.blue, fontWeight: '600', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  gpsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  gpsLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  gpsSub: { fontSize: 12, color: COLORS.muted, marginTop: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  zoneCard: { width: '47%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  zoneCardNear: { borderColor: COLORS.amber + '66', backgroundColor: '#1a1200' },
  zoneCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  zoneEmoji: { fontSize: 24 },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneCardName: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  zoneCardFee: { fontSize: 20, fontWeight: '900', color: COLORS.amber },
  zoneCardDist: { fontSize: 11, color: COLORS.muted, marginTop: 3 },
});
