import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Storage, UserData } from '../services/storage';
import { COLORS } from '../services/api';

export default function SettingsScreen({ user: initialUser, onClose, onReset }: { user: UserData; onClose: () => void; onReset: () => void }) {
  const [name, setName] = useState(initialUser.name);
  const [plate, setPlate] = useState(initialUser.plate);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const reset = () => Alert.alert('Reset App?', 'This will clear all your data and start over.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: async () => { await Storage.clearAll(); onReset(); } },
  ]);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>SETTINGS</Text>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Text style={s.closeX}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={s.scroll}>

        <Text style={s.sec}>PROFILE</Text>
        <View style={s.card}>
          <Text style={s.label}>Name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor={COLORS.dim}
            autoCapitalize="words"
          />
          <Text style={[s.label, { marginTop: 12 }]}>Vehicle Plate</Text>
          <TextInput
            style={[s.input, s.plateInput]}
            value={plate}
            onChangeText={t => setPlate(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity style={s.saveBtn} onPress={save} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnText}>{saved ? '✓ Saved!' : 'Save Changes'}</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.sec}>ACCOUNT</Text>
        <View style={s.card}>
          <TouchableOpacity onPress={reset}>
            <Text style={s.resetText}>Reset & Start Over</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.version}>NoFine v1.0 · Airport Charge Manager</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  closeBtn: { width: 36, height: 36, backgroundColor: COLORS.surface, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  closeX: { color: COLORS.muted, fontSize: 16, fontWeight: '600' },
  scroll: { flex: 1, padding: 16 },
  sec: { fontSize: 10, fontWeight: '700', color: COLORS.dim, letterSpacing: 2, marginBottom: 8, marginTop: 8 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 11, color: COLORS.muted, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface2, borderRadius: 10, padding: 12, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  plateInput: { fontSize: 20, fontWeight: '800', color: COLORS.amber, letterSpacing: 3, textAlign: 'center' },
  saveBtn: { backgroundColor: COLORS.green, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 14 },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  resetText: { color: COLORS.red, fontWeight: '600', fontSize: 14 },
  version: { textAlign: 'center', color: COLORS.dim, fontSize: 12, marginVertical: 24 },
});
