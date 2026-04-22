import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, Linking, Switch, AppState, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import { Storage, UserData, Charge } from '../services/storage';
import { COLORS } from '../services/api';
import { DISPLAY_ZONES } from '../services/zones';
import { haversineKm } from '../utils/distance';

export default function HomeScreen({
  user,
  onOpenSettings,
  gpsEnabled,
  onToggleGPS,
}: {
  user: UserData;
  onOpenSettings: () => void;
  gpsEnabled: boolean;
  onToggleGPS: () => void;
}) {
  const [charges, setCharges]       = useState<Charge[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords]         = useState<{ latitude: number; longitude: number } | null>(null);
  const hasUnpaidRef                = useRef(false);

  const load = useCallback(async () => {
    const c = await Storage.getCharges();
    setCharges(c);
    hasUnpaidRef.current = c.some(ch => !ch.paid);
  }, []);

  useEffect(() => {
    load();
    Location.getCurrentPositionAsync({}).then(loc => setCoords(loc.coords)).catch(() => {});

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') load();
    });
    const interval = setInterval(() => {
      if (hasUnpaidRef.current) load();
    }, 15_000);

    return () => { appStateSub.remove(); clearInterval(interval); };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const unpaid = charges.filter(c => !c.paid);

  const getDist = (lat: number, lng: number): number | null => {
    if (!coords) return null;
    return haversineKm(coords.latitude, coords.longitude, lat, lng);
  };

  const sortedZones = [...DISPLAY_ZONES].sort((a, b) => {
    const da = getDist(a.lat, a.lng) ?? 999;
    const db = getDist(b.lat, b.lng) ?? 999;
    return da - db;
  });

  const totalAvoided  = charges.filter(c => c.paid).reduce((s, c) => s + c.penaltyFee, 0);
  const now           = new Date();
  const thisMonthCount = charges.filter(c => {
    const d = new Date(c.enteredAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const overdueCount  = unpaid.filter(c => new Date(c.deadline).getTime() < Date.now()).length;

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.green} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.welcome}>Welcome back,</Text>
            <Text style={s.name}>{user.name}</Text>
          </View>
          <View style={s.headerRight}>
            <View style={s.plateBox}>
              <Text style={s.plate}>{user.plate}</Text>
            </View>
            <TouchableOpacity style={s.settingsBtn} onPress={onOpenSettings}>
              <Text style={{ fontSize: 18 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.pad}>
          {/* ── Charges / All Clear ── */}
          {unpaid.length === 0 ? (
            <AllClear />
          ) : (
            unpaid.map(c => <ChargeCard key={c.id} charge={c} onPaid={load} />)
          )}

          {/* ── Stats row ── */}
          <View style={s.statsRow}>
            <StatBox label="Penalties Avoided" value={`£${totalAvoided.toFixed(0)}`}  color={COLORS.green} />
            <StatBox label="This Month"         value={`${thisMonthCount}`}             color={COLORS.blue} />
            <StatBox label="Overdue"            value={`${overdueCount}`}               color={overdueCount > 0 ? COLORS.red : COLORS.muted} />
          </View>

          {/* ── GPS toggle ── */}
          <View style={s.gpsRow}>
            <View>
              <Text style={s.gpsLabel}>GPS Monitoring</Text>
              <Text style={s.gpsSub}>Detect charge zones automatically</Text>
            </View>
            <Switch
              value={gpsEnabled}
              onValueChange={onToggleGPS}
              trackColor={{ false: COLORS.surface2, true: COLORS.green }}
              thumbColor="#fff"
            />
          </View>

          {/* ── Zone grid ── */}
          <Text style={s.sectionTitle}>London Zones</Text>
          <View style={s.zoneGrid}>
            {sortedZones.map(z => {
              const dist   = getDist(z.lat, z.lng);
              const isNear = dist !== null && dist < 5;
              const distText = dist === null
                ? '…'
                : dist < 1
                  ? `${Math.round(dist * 1609)} ft`
                  : `${(dist * 0.621371).toFixed(1)} mi`;
              return (
                <View key={z.id} style={[s.zoneCard, isNear && s.zoneCardNear]}>
                  <View style={s.zoneTop}>
                    <Text style={s.zoneEmoji}>{z.emoji}</Text>
                    <View style={[s.zoneDot, { backgroundColor: isNear ? COLORS.amber : COLORS.green }]} />
                  </View>
                  <Text style={s.zoneName}>{z.shortName}</Text>
                  <Text style={s.zoneFee}>£{z.fee}</Text>
                  <Text style={s.zoneDist}>{distText} away</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── All Clear ────────────────────────────────────────────────────────────────

function AllClear() {
  return (
    <View style={s.clearCard}>
      <View style={s.clearIcon}>
        <Text style={{ fontSize: 28 }}>🛡️</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.clearTitle}>All Clear</Text>
        <Text style={s.clearSub}>No unpaid charges · Safe to drive</Text>
      </View>
    </View>
  );
}

// ─── Hazard stripe ────────────────────────────────────────────────────────────

function HazardStripe() {
  return (
    <View style={{ height: 11, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#000' }}>
      {Array.from({ length: 50 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 22,
            backgroundColor: i % 2 === 0 ? '#FFD700' : '#111',
            transform: [{ skewX: '-20deg' }],
          }}
        />
      ))}
    </View>
  );
}

// ─── Charge card ──────────────────────────────────────────────────────────────

function ChargeCard({ charge, onPaid }: { charge: Charge; onPaid: () => void }) {
  const remaining = new Date(charge.deadline).getTime() - Date.now();
  const days      = Math.max(0, Math.floor(remaining / 86_400_000));
  const hours     = Math.max(0, Math.floor((remaining % 86_400_000) / 3_600_000));
  const urgent    = remaining < 3_600_000;
  const overdue   = remaining <= 0;

  const deadlineText = overdue
    ? 'OVERDUE — PAY NOW'
    : days > 0
      ? `Pay within ${days} day${days > 1 ? 's' : ''} ${hours}h`
      : `Pay within ${hours}h — deadline tonight`;

  const markPaid = async () => {
    const all     = await Storage.getCharges();
    const updated = all.map((c: Charge) =>
      c.id === charge.id ? { ...c, paid: true, paidAt: new Date().toISOString() } : c,
    );
    await Storage.saveCharges(updated);
    await Storage.addToHistory({ ...charge, paid: true, paidAt: new Date().toISOString() });
    const unpaidCount = updated.filter((c: Charge) => !c.paid).length;
    await Notifications.setBadgeCountAsync(unpaidCount);
    onPaid();
  };

  return (
    <View style={cc.card}>
      {/* Header */}
      <View style={cc.header}>
        <Text style={cc.headerLabel}>PARKING CHARGE NOTICE</Text>
        <Text style={cc.headerVrm}>{charge.plate}</Text>
      </View>

      {/* Hazard stripe */}
      <HazardStripe />

      {/* Amount section */}
      <View style={cc.amountSection}>
        <Text style={cc.amountLabel}>PARKING CHARGE AMOUNT</Text>
        <Text style={cc.amountFee}>£{charge.fee.toFixed(2)}</Text>
        <Text style={cc.amountPenalty}>
          Unpaid after deadline: £{charge.penaltyFee} penalty
        </Text>
      </View>

      {/* Hazard stripe bottom */}
      <HazardStripe />

      {/* Details */}
      <View style={cc.details}>
        <View style={cc.detailRow}>
          <Text style={cc.detailKey}>LOCATION</Text>
          <Text style={cc.detailVal}>{charge.zoneName}</Text>
        </View>
        {charge.enteredAt && (
          <View style={cc.detailRow}>
            <Text style={cc.detailKey}>ENTRY TIME</Text>
            <Text style={cc.detailVal}>
              {new Date(charge.enteredAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
        {charge.durationMinutes && (
          <View style={cc.detailRow}>
            <Text style={cc.detailKey}>DURATION</Text>
            <Text style={cc.detailVal}>{charge.durationMinutes} min</Text>
          </View>
        )}
        <View style={[cc.detailRow, cc.deadlineRow, urgent && { backgroundColor: '#3a0000' }]}>
          <Text style={[cc.deadlineText, urgent && { color: COLORS.red }]}>
            {overdue ? '🚨' : '⏰'}  {deadlineText}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={cc.actions}>
        <TouchableOpacity style={cc.portalBtn} onPress={() => Linking.openURL(charge.payUrl)}>
          <Text style={cc.portalBtnText}>PAY NOW →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cc.paidBtn} onPress={markPaid}>
          <Text style={cc.paidBtnText}>✓  Mark Paid</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cc = StyleSheet.create({
  card:           { borderRadius: 4, overflow: 'hidden', marginBottom: 16, borderWidth: 1.5, borderColor: '#FFD700' },

  header:         { backgroundColor: '#0a1628', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  headerLabel:    { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  headerVrm:      { fontSize: 13, fontWeight: '900', color: '#FFD700', letterSpacing: 3, backgroundColor: '#000', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3 },

  amountSection:  { backgroundColor: '#000', paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center' },
  amountLabel:    { fontSize: 10, fontWeight: '800', color: '#aaa', letterSpacing: 2, marginBottom: 4 },
  amountFee:      { fontSize: 52, fontWeight: '900', color: '#FFD700', letterSpacing: -1 },
  amountPenalty:  { fontSize: 11, color: '#666', marginTop: 4 },

  details:        { backgroundColor: '#0d0f18', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1a1c28' },
  detailKey:      { fontSize: 10, fontWeight: '800', color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' },
  detailVal:      { fontSize: 12, fontWeight: '700', color: '#ccc' },
  deadlineRow:    { borderBottomWidth: 0, marginTop: 4, marginBottom: 8, backgroundColor: '#1a1200', borderRadius: 4, paddingHorizontal: 10, justifyContent: 'center' },
  deadlineText:   { fontSize: 12, fontWeight: '700', color: '#FFD700', textAlign: 'center' },

  actions:        { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#0d0f18' },
  portalBtn:      { flex: 2, backgroundColor: '#0a1628', borderRadius: 6, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFD700' },
  portalBtnText:  { color: '#FFD700', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  paidBtn:        { flex: 1, backgroundColor: COLORS.greenDim, borderRadius: 6, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.green + '66' },
  paidBtnText:    { color: COLORS.green, fontWeight: '700', fontSize: 13 },
});

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  welcome:    { fontSize: 13, color: COLORS.muted, fontWeight: '500', marginBottom: 2 },
  name:       { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  headerRight:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  plateBox:   { backgroundColor: COLORS.amberDim, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.amber + '44' },
  plate:      { fontSize: 13, fontWeight: '800', color: COLORS.amber, letterSpacing: 2 },
  settingsBtn:{ width: 40, height: 40, backgroundColor: COLORS.surface, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },

  pad:        { paddingHorizontal: 16, paddingBottom: 16 },

  // All Clear
  clearCard:  { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: COLORS.greenDim, borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.green + '40' },
  clearIcon:  { width: 56, height: 56, backgroundColor: COLORS.green + '20', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  clearTitle: { fontSize: 20, fontWeight: '800', color: COLORS.green, marginBottom: 3 },
  clearSub:   { fontSize: 13, color: COLORS.muted },


  // Stats
  statsRow:   { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox:    { flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: COLORS.border },
  statValue:  { fontSize: 20, fontWeight: '800' },
  statLabel:  { fontSize: 10, color: COLORS.muted, fontWeight: '600', textAlign: 'center' },

  // GPS toggle
  gpsRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  gpsLabel:   { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  gpsSub:     { fontSize: 12, color: COLORS.muted },

  // Zone grid
  sectionTitle:{ fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  zoneGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  zoneCard:    { width: '47%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  zoneCardNear:{ borderColor: COLORS.amber + '66', backgroundColor: '#1a1200' },
  zoneTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  zoneEmoji:   { fontSize: 22 },
  zoneDot:     { width: 8, height: 8, borderRadius: 4 },
  zoneName:    { fontSize: 12, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  zoneFee:     { fontSize: 20, fontWeight: '900', color: COLORS.amber, marginBottom: 4 },
  zoneDist:    { fontSize: 11, color: COLORS.muted },
});
