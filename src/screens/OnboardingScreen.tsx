import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Storage } from '../services/storage';
import { API, COLORS } from '../services/api';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    setLoading(true);
    try {
      const data = await API.dvlaLookup(plate.trim());
      setVehicle(data);
      setStep(2);
    } catch { Alert.alert('Error', 'Could not verify plate'); }
    finally { setLoading(false); }
  };

  const finish = async () => {
    await Storage.saveUser({ name: name.trim(), plate: plate.trim().toUpperCase(), make: vehicle?.make, model: vehicle?.model, colour: vehicle?.colour, year: vehicle?.year, extraPlates: [] });
    onDone();
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Text style={s.logoText}>NoFine</Text>
          <Text style={s.logoSub}>Airport Charge Manager</Text>
        </View>
        {step === 1 && (
          <View style={s.card}>
            <Text style={s.label}>YOUR NAME</Text>
            <TextInput style={s.input} placeholder="Your name" placeholderTextColor={COLORS.dim} value={name} onChangeText={setName} autoCapitalize="words" />
            <Text style={[s.label, { marginTop: 16 }]}>VEHICLE PLATE</Text>
            <TextInput style={[s.input, s.plateInput]} placeholder="AB12 CDE" placeholderTextColor={COLORS.dim} value={plate} onChangeText={t => setPlate(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
            <TouchableOpacity style={[s.btn, (!name.trim() || !plate.trim()) && { opacity: 0.4 }]} onPress={verify} disabled={loading || !name.trim() || !plate.trim()}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Verify Plate →</Text>}
            </TouchableOpacity>
          </View>
        )}
        {step === 2 && vehicle && (
          <View style={s.card}>
            <Text style={s.verified}>✓ Plate Verified</Text>
            <View style={s.vehicleCard}>
              <Text style={s.plateDisplay}>{plate.toUpperCase()}</Text>
              <Text style={s.vehicleInfo}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
              <Text style={s.vehicleColour}>{vehicle.colour}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowLabel}>Driver</Text>
              <Text style={s.rowValue}>{name}</Text>
            </View>
            <TouchableOpacity style={s.btn} onPress={finish}>
              <Text style={s.btnText}>Start Driving 🚗</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.back} onPress={() => setStep(1)}>
              <Text style={s.backText}>← Change plate</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { alignItems: 'center', marginBottom: 40 },
  logoText: { fontSize: 48, fontWeight: '800', color: COLORS.green, letterSpacing: -1 },
  logoSub: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 1.5, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 14, fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  plateInput: { fontSize: 24, fontWeight: '800', color: COLORS.amber, letterSpacing: 4, textAlign: 'center', marginBottom: 4 },
  btn: { backgroundColor: COLORS.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
  btnText: { fontSize: 16, fontWeight: '800', color: '#000' },
  verified: { fontSize: 18, fontWeight: '700', color: COLORS.green, marginBottom: 16 },
  vehicleCard: { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  plateDisplay: { fontSize: 28, fontWeight: '800', color: COLORS.amber, letterSpacing: 4 },
  vehicleInfo: { fontSize: 16, color: COLORS.text, marginTop: 6, fontWeight: '600' },
  vehicleColour: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderColor: COLORS.border },
  rowLabel: { fontSize: 13, color: COLORS.muted },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  back: { alignItems: 'center', marginTop: 12 },
  backText: { fontSize: 13, color: COLORS.blue },
});
