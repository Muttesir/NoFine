import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Storage, UserData } from '../services/storage';
import { COLORS } from '../services/api';

export default function SettingsScreen({
  user: initialUser,
  onClose,
  onReset,
}: {
  user: UserData;
  onClose: () => void;
  onReset: () => void;
}) {
  const [name,    setName]    = useState(initialUser.name);
  const [plate,   setPlate]   = useState(initialUser.plate);
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      await Storage.saveUser({ ...initialUser, name: name.trim(), plate: plate.trim().toUpperCase() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => Alert.alert(
    'Reset App?',
    'This will clear all your data and start over.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => { await Storage.clearAll(); onReset(); } },
    ],
  );

  return (
    <SafeAreaView style={s.root}>
      {/* Handle */}
      <View style={s.handleRow}>
        <View style={s.handle} />
      </View>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>SETTINGS</Text>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Text style={s.closeX}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <SectionLabel label="Profile" />
        <View style={s.card}>
          <FieldLabel label="Name" />
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor={COLORS.dim}
            autoCapitalize="words"
            placeholder="Your name"
          />
          <FieldLabel label="Vehicle Plate" />
          <TextInput
            style={[s.input, s.plateInput]}
            value={plate}
            onChangeText={t => setPlate(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="AB12 CDE"
            placeholderTextColor={COLORS.dim}
          />
          <TouchableOpacity style={s.saveBtn} onPress={save} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={s.saveBtnText}>{saved ? '✓  Saved!' : 'Save Changes'}</Text>}
          </TouchableOpacity>
        </View>

        {/* Vehicle info */}
        {initialUser.make && (
          <>
            <SectionLabel label="Vehicle" />
            <View style={s.card}>
              <View style={s.vehicleRow}>
                <VehicleBadge label="Make"   value={initialUser.make   || 'N/A'} />
                <VehicleBadge label="Year"   value={initialUser.year ? String(initialUser.year) : 'N/A'} />
                <VehicleBadge label="Colour" value={initialUser.colour || 'N/A'} />
              </View>
            </View>
          </>
        )}

        {/* Account */}
        <SectionLabel label="Account" />
        <View style={s.card}>
          <TouchableOpacity onPress={reset}>
            <Text style={s.resetText}>Reset &amp; Start Over</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.version}>NoFine v1.0 · Know Before You Owe</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.dim, letterSpacing: 2, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' }}>{label}</Text>;
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={{ fontSize: 11, color: COLORS.muted, marginBottom: 7, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>;
}

function VehicleBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={vb.badge}>
      <Text style={vb.label}>{label}</Text>
      <Text style={vb.value}>{value}</Text>
    </View>
  );
}

const vb = StyleSheet.create({
  badge: { flex: 1, backgroundColor: COLORS.surface2, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 9, color: COLORS.muted, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  value: { fontSize: 13, fontWeight: '700', color: COLORS.text },
});

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: COLORS.bg },
  handleRow:  { paddingTop: 10, alignItems: 'center' },
  handle:     { width: 36, height: 4, borderRadius: 3, backgroundColor: COLORS.border },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  title:      { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  closeBtn:   { width: 36, height: 36, backgroundColor: COLORS.surface, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  closeX:     { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
  scroll:     { flex: 1, paddingHorizontal: 16 },

  card:       { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  input:      { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 13, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  plateInput: { fontSize: 22, fontWeight: '800', color: COLORS.amber, letterSpacing: 4, textAlign: 'center' },
  saveBtn:    { backgroundColor: COLORS.green, borderRadius: 13, padding: 15, alignItems: 'center' },
  saveBtnText:{ color: '#000', fontWeight: '800', fontSize: 15 },

  vehicleRow: { flexDirection: 'row', gap: 8 },
  resetText:  { color: COLORS.red, fontWeight: '600', fontSize: 14 },
  version:    { textAlign: 'center', color: COLORS.dim, fontSize: 12, marginVertical: 24 },

});
