import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Storage, Charge } from '../services/storage';
import { COLORS } from '../services/api';

export default function HistoryScreen() {
  const [history, setHistory] = useState<Charge[]>([]);

  useEffect(() => { Storage.getHistory().then(setHistory); }, []);

  const totalPaid  = history.reduce((s, c) => s + c.fee, 0);
  const totalSaved = history.reduce((s, c) => s + c.penaltyFee, 0);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>History</Text>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Summary cards */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Paid this month</Text>
            <Text style={[s.statValue, { color: COLORS.green }]}>£{totalPaid.toFixed(2)}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Penalties avoided</Text>
            <Text style={[s.statValue, { color: COLORS.amber }]}>£{totalSaved.toFixed(0)}</Text>
          </View>
        </View>

        {/* Section label */}
        <Text style={s.sectionLabel}>TRANSACTIONS</Text>

        {/* Empty state */}
        {history.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
            <Text style={s.emptyTitle}>No trips yet</Text>
            <Text style={s.emptySub}>Your payment history will appear here</Text>
          </View>
        ) : (
          history.map(c => {
            const date    = new Date(c.paidAt || c.enteredAt);
            const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            return (
              <View key={c.id} style={s.row}>
                <View style={s.rowLeft}>
                  <View style={s.rowIcon}>
                    <Text style={{ fontSize: 16 }}>✈️</Text>
                  </View>
                  <View>
                    <Text style={s.rowName}>{c.zoneName}</Text>
                    <Text style={s.rowDate}>{dateStr}</Text>
                  </View>
                </View>
                <View style={s.rowRight}>
                  <Text style={s.rowFee}>-£{c.fee.toFixed(2)}</Text>
                  <Text style={s.rowSaved}>£{c.penaltyFee} avoided</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.bg },
  header:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title:       { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  scroll:      { flex: 1, paddingHorizontal: 16 },

  statsRow:    { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard:    { flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  statLabel:   { fontSize: 11, color: COLORS.muted, marginBottom: 6, fontWeight: '600' },
  statValue:   { fontSize: 24, fontWeight: '800' },

  sectionLabel:{ fontSize: 10, fontWeight: '700', color: COLORS.dim, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },

  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  rowLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon:     { width: 38, height: 38, backgroundColor: COLORS.surface2, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  rowName:     { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  rowDate:     { fontSize: 11, color: COLORS.muted },
  rowRight:    { alignItems: 'flex-end', gap: 3 },
  rowFee:      { fontSize: 15, fontWeight: '800', color: COLORS.green },
  rowSaved:    { fontSize: 11, color: COLORS.green + 'cc', fontWeight: '600' },

  empty:       { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.muted, marginBottom: 8 },
  emptySub:    { fontSize: 13, color: COLORS.dim, textAlign: 'center', lineHeight: 20 },
});
