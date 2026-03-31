import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { Storage, UserData, Charge } from '../services/storage';
import { COLORS, ZONES } from '../services/api';

export default function HomeScreen({ user, onOpenSettings }: { user: UserData; onOpenSettings: () => void }) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { const c = await Storage.getCharges(); setCharges(c.filter(x => !x.paid)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const unpaid = charges.filter(c => !c.paid);
  return (
    <SafeAreaView style={s.root}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.green} />}>
        <View style={s.header}>
          <View>
            <Text style={s.welcome}>Welcome back,</Text>
            <Text style={s.name}>{user.name.toUpperCase()}</Text>
          </View>
          <View style={s.headerRight}>
            <View style={s.plateBox}><Text style={s.plate}>{user.plate}</Text></View>
            <TouchableOpacity style={s.settingsBtn} onPress={onOpenSettings}><Text style={{ fontSize: 18 }}>⚙️</Text></TouchableOpacity>
          </View>
        </View>
        <View style={s.pad}>
          {unpaid.length === 0 ? (
            <View style={s.clearCard}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <View><Text style={s.clearTitle}>ALL CLEAR</Text><Text style={s.clearSub}>No active charges · Safe to drive</Text></View>
            </View>
          ) : unpaid.map(c => <ChargeCard key={c.id} charge={c} onPaid={load} />)}
          <View style={s.statsRow}>
            <StatBox label="Saved" value="£0" color={COLORS.green} />
            <StatBox label="Trips" value="0" color={COLORS.amber} />
            <StatBox label="Missed" value="0" color={COLORS.red} />
          </View>
          <Text style={s.sectionTitle}>MONITORED ZONES</Text>
          {ZONES.map(z => (
            <View key={z.id} style={s.zoneRow}>
              <Text style={{ fontSize: 22, width: 36 }}>{z.emoji}</Text>
              <View style={{ flex: 1 }}><Text style={s.zoneName}>{z.name}</Text><Text style={s.zoneNote}>{z.note}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={s.zoneFee}>£{z.fee}</Text><Text style={{ fontSize: 10, color: COLORS.green, fontWeight: '700' }}>● Clear</Text></View>
            </View>
          ))}
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
    <View style={[s.chargeCard, urgent && { backgroundColor: COLORS.redDim, borderColor: COLORS.red + '55' }]}>
      <Text style={s.chargeName}>{charge.zoneName}</Text>
      <Text style={[s.chargeFee, urgent && { color: COLORS.red }]}>£{charge.fee.toFixed(2)}</Text>
      <Text style={[s.chargeTimer, urgent && { color: COLORS.red }]}>{urgent ? '🚨' : '⏰'} {hours}h {mins}min left · Pay by midnight</Text>
      <View style={s.payRow}>
        <TouchableOpacity style={s.appleBtn}><Text style={{ color: '#fff', fontWeight: '700' }}>🍎 Pay</Text></TouchableOpacity>
        <TouchableOpacity style={s.payBtn}><Text style={{ color: '#000', fontWeight: '800', fontSize: 14 }}>PAY £{charge.fee.toFixed(2)}</Text></TouchableOpacity>
      </View>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8 },
  welcome: { fontSize: 12, color: COLORS.muted },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plateBox: { backgroundColor: COLORS.amberDim, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.amber + '44' },
  plate: { fontSize: 15, fontWeight: '800', color: COLORS.amber, letterSpacing: 2 },
  settingsBtn: { width: 38, height: 38, backgroundColor: COLORS.surface, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  pad: { padding: 16 },
  clearCard: { backgroundColor: COLORS.greenDim, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.green + '33' },
  clearTitle: { fontSize: 22, fontWeight: '800', color: COLORS.green },
  clearSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  chargeCard: { backgroundColor: '#1a0800', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: COLORS.amber + '44' },
  chargeName: { fontSize: 13, color: COLORS.amber + 'aa', marginBottom: 4 },
  chargeFee: { fontSize: 50, fontWeight: '800', color: COLORS.amber, lineHeight: 54 },
  chargeTimer: { fontSize: 12, color: COLORS.amber, marginTop: 4, marginBottom: 14 },
  payRow: { flexDirection: 'row', gap: 8 },
  appleBtn: { flex: 1, backgroundColor: '#000', borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  payBtn: { flex: 2, backgroundColor: COLORS.amber, borderRadius: 10, padding: 13, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20, marginTop: 4 },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: COLORS.dim, letterSpacing: 2, marginBottom: 10 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  zoneName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  zoneNote: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  zoneFee: { fontSize: 17, fontWeight: '800', color: COLORS.text },
});
