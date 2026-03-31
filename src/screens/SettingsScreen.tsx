import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Storage, UserData } from '../services/storage';
import { API, COLORS } from '../services/api';

export default function SettingsScreen({ user, onClose, onReset }: { user: UserData; onClose: () => void; onReset: () => void }) {
  const [name, setName] = useState(user.name);
  const [plate, setPlate] = useState(user.plate);
  const [newPlate, setNewPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setLoading(true);
    try { await Storage.saveUser({ ...user, name: name.trim(), plate: plate.trim().toUpperCase() }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setLoading(false); }
  };

  const addVehicle = async () => {
    if (!newPlate.trim()) return;
    setLoading(true);
    try {
      const dvla = await API.dvlaLookup(newPlate.trim());
      const extras = [...(user.extraPlates || []), { plate: newPlate.trim().toUpperCase(), make: dvla.make, model: dvla.model, colour: dvla.colour }];
      await Storage.saveUser({ ...user, extraPlates: extras });
      setNewPlate('');
      Alert.alert('Added!', `${newPlate.toUpperCase()} added`);
    } catch { Alert.alert('Error', 'Could not add vehicle'); }
    finally { setLoading(false); }
  };

  const removeVehicle = async (p: string) => {
    await Storage.saveUser({ ...user, extraPlates: (user.extraPlates || []).filter(e => e.plate !== p) });
  };

  const reset = () => Alert.alert('Reset?', 'Clears all data.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: async () => { await Storage.clearAll(); onReset(); } },
  ]);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>SETTINGS</Text>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}><Text style={s.closeX}>✕</Text></TouchableOpacity>
      </View>
      <ScrollView style={s.scroll}>
        <Text style={s.sec}>PROFILE</Text>
        <View style={s.card}>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={COLORS.dim} autoCapitalize="words" />
          <Text style={[s.label, { marginTop: 12 }]}>Primary Plate</Text>
          <TextInput style={[s.input, s.plateInput]} value={plate} onChangeText={t => setPlate(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
          <TouchableOpacity style={s.saveBtn} onPress={save} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnText}>{saved ? '✓ Saved!' : 'Save Changes'}</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.sec}>EXTRA VEHICLES</Text>
        <View style={s.card}>
          {(user.extraPlates || []).map(ep => (
            <View key={ep.plate} style={s.extraRow}>
              <View><Text style={s.extraPlate}>{ep.plate}</Text><Text style={s.extraInfo}>{ep.make} {ep.model} · {ep.colour}</Text></View>
              <TouchableOpacity onPress={() => removeVehicle(ep.plate)} style={s.removeBtn}><Text style={{ color: COLORS.red, fontWeight: '700' }}>✕</Text></TouchableOpacity>
            </View>
          ))}
          <TextInput style={[s.input, s.plateInput, { marginTop: 8 }]} placeholder="Add plate..." placeholderTextColor={COLORS.dim} value={newPlate} onChangeText={t => setNewPlate(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
          <TouchableOpacity style={[s.addBtn, !newPlate.trim() && { opacity: 0.4 }]} onPress={addVehicle} disabled={loading || !newPlate.trim()}>
            <Text style={{ color: COLORS.blue, fontWeight: '700' }}>+ Add Vehicle</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sec}>ACCOUNT</Text>
        <View style={s.card}>
          <TouchableOpacity onPress={reset}><Text style={{ color: COLORS.red, fontWeight: '600', fontSize: 14 }}>Reset & Start Over</Text></TouchableOpacity>
        </View>
        <TouchableOpacity onPress={async () => { const user = await Storage.getUser(); if (!user) return; const charges = await Storage.getCharges(); charges.push({ id: Date.now().toString(), zoneId: "luton", zoneName: "Luton Airport", plate: user.plate, enteredAt: new Date().toISOString(), fee: 7, penaltyFee: 95, deadline: new Date(Date.now() + 86400000).toISOString(), payUrl: "https://www.london-luton.co.uk", paid: false }); await Storage.saveCharges(charges); Alert.alert("Test", "Luton zone entry simulated!"); }}><Text style={{ color: COLORS.blue, textAlign: "center", padding: 12 }}>🧪 Simulate Luton Entry</Text></TouchableOpacity>
<Text style={s.version}>NoFine v2.0</Text>
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
  extraRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.border },
  extraPlate: { fontSize: 16, fontWeight: '800', color: COLORS.amber, letterSpacing: 2 },
  extraInfo: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  removeBtn: { width: 28, height: 28, backgroundColor: COLORS.redDim, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  addBtn: { backgroundColor: COLORS.surface2, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: COLORS.border },
  version: { textAlign: 'center', color: COLORS.dim, fontSize: 12, marginVertical: 24 },
});
