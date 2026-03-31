import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Storage, Charge } from '../services/storage';
import { COLORS } from '../services/api';

export default function HistoryScreen() {
  const [history, setHistory] = useState<Charge[]>([]);
  useEffect(() => { Storage.getHistory().then(setHistory); }, []);
  const totalPaid = history.reduce((s, c) => s + c.fee, 0);
  const totalSaved = history.reduce((s, c) => s + c.penaltyFee, 0);
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}><Text style={s.title}>History</Text></View>
      <ScrollView style={s.scroll}>
        <View style={s.statsRow}>
          <View style={s.statBox}><Text style={s.statLabel}>Paid this month</Text><Text style={[s.statValue, { color: COLORS.green }]}>£{totalPaid.toFixed(2)}</Text></View>
          <View style={s.statBox}><Text style={s.statLabel}>Penalties avoided</Text><Text style={[s.statValue, { color: COLORS.amber }]}>£{totalSaved.toFixed(0)}</Text></View>
        </View>
        <Text style={s.sectionTitle}>TRANSACTIONS</Text>
        {history.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No trips yet</Text><Text style={s.emptySub}>Your payment history will appear here</Text></View>
        ) : history.map(c => (
          <View key={c.id} style={s.row}>
            <View><Text style={s.rowName}>{c.zoneName}</Text><Text style={s.rowDate}>{new Date(c.paidAt || c.enteredAt).toLocaleDateString('en-GB')}</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={s.rowFee}>-£{c.fee.toFixed(2)}</Text><Text style={s.rowSaved}>£{c.penaltyFee} avoided</Text></View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  scroll: { flex: 1, padding: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  statLabel: { fontSize: 11, color: COLORS.muted, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '800' },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: COLORS.dim, letterSpacing: 2, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  rowName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  rowDate: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  rowFee: { fontSize: 15, fontWeight: '700', color: COLORS.green },
  rowSaved: { fontSize: 11, color: COLORS.green, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.muted },
  emptySub: { fontSize: 13, color: COLORS.dim, marginTop: 8 },
});
