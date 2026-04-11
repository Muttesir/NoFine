import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Storage } from '../services/storage';
import { API, COLORS, BASE_URL } from '../services/api';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicle, setVehicle] = useState<any>(null);
  const [ulez, setUlez] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notUK, setNotUK] = useState(false);

  const verify = async () => {
    setLoading(true);
    try {
      const data = await API.dvlaLookup(plate.trim());
      setVehicle(data);
      const ulezRes = await fetch(`${BASE_URL}/api/ulez-check?plate=${plate.trim()}`);
      const ulezData = await ulezRes.json();
      setUlez(ulezData);
      setStep(2);
    } catch {
      Alert.alert('Error', 'Could not verify plate. Is it a UK registered vehicle?');
    } finally {
      setLoading(false);
    }
  };

  const skipVerify = () => {
    setVehicle({ make: 'UNKNOWN', colour: 'UNKNOWN', year: null, verified: false });
    setUlez(null);
    setNotUK(true);
    setStep(2);
  };

  const finish = async () => {
    await Storage.saveUser({
      name: name.trim(),
      plate: plate.trim().toUpperCase(),
      make: vehicle?.make,
      colour: vehicle?.colour,
      year: vehicle?.year,
      extraPlates: [],
    });
    onDone();
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Text style={s.logoText}>NoFine</Text>
          <Text style={s.logoSub}>Airport & Charge Manager</Text>
        </View>

        {step === 1 && (
          <View style={s.card}>
            <Text style={s.label}>YOUR NAME</Text>
            <TextInput style={s.input} placeholder="Your name" placeholderTextColor={COLORS.dim} value={name} onChangeText={setName} autoCapitalize="words" />
            <Text style={[s.label, { marginTop: 16 }]}>VEHICLE PLATE</Text>
            <TextInput style={[s.input, s.plateInput]} placeholder="AB12 CDE" placeholderTextColor={COLORS.dim} value={plate} onChangeText={t => setPlate(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
            <TouchableOpacity
              style={[s.btn, (!name.trim() || !plate.trim()) && { opacity: 0.4 }]}
              onPress={verify}
              disabled={loading || !name.trim() || !plate.trim()}
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Verify UK Plate →</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.skipBtn} onPress={() => { if (!name.trim() || !plate.trim()) { Alert.alert('Please enter your name and plate first'); return; } skipVerify(); }}>
              <Text style={s.skipText}>Not a UK registered vehicle?</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={s.card}>
            {notUK ? (
              <Text style={s.verified}>⚠️ Non-UK Vehicle</Text>
            ) : (
              <Text style={s.verified}>✓ Plate Verified</Text>
            )}

            <View style={s.vehicleCard}>
              <Text style={s.plateDisplay}>{plate.toUpperCase()}</Text>
              {!notUK && vehicle && (
                <>
                  <View style={s.vehicleRow}>
                    <VehicleBadge label="Make" value={vehicle.make || 'N/A'} />
                    <VehicleBadge label="Year" value={vehicle.year ? String(vehicle.year) : 'N/A'} />
                    <VehicleBadge label="Colour" value={vehicle.colour || 'N/A'} />
                  </View>
                </>
              )}
              {notUK && (
                <Text style={s.vehicleNote}>ULEZ/CCZ charges may apply — check manually</Text>
              )}
            </View>

            {ulez && !notUK && (
              <View style={[s.ulezCard, { backgroundColor: ulez.ulezCompliant ? COLORS.greenDim : COLORS.redDim, borderColor: ulez.ulezCompliant ? COLORS.green + '44' : COLORS.red + '44' }]}>
                <Text style={{ fontSize: 22 }}>{ulez.ulezCompliant ? '✅' : '⚠️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ulezTitle, { color: ulez.ulezCompliant ? COLORS.green : COLORS.red }]}>
                    {ulez.ulezCompliant ? 'ULEZ Exempt' : 'ULEZ Charge Applies'}
                  </Text>
                  <Text style={s.ulezSub}>
                    {ulez.ulezCompliant
                      ? 'Your vehicle is exempt from ULEZ charges'
                      : `£${ulez.charge}/day charge when driving in London`}
                  </Text>
                </View>
              </View>
            )}

            <View style={s.row}>
              <Text style={s.rowLabel}>Driver</Text>
              <Text style={s.rowValue}>{name}</Text>
            </View>

            <TouchableOpacity style={s.btn} onPress={finish}>
              <Text style={s.btnText}>Start Driving 🚗</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.back} onPress={() => { setStep(1); setNotUK(false); }}>
              <Text style={s.backText}>← Change plate</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VehicleBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={vs.badge}>
      <Text style={vs.label}>{label}</Text>
      <Text style={vs.value}>{value}</Text>
    </View>
  );
}

const vs = StyleSheet.create({
  badge: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 9, color: COLORS.muted, letterSpacing: 1, marginBottom: 4 },
  value: { fontSize: 13, fontWeight: '700', color: COLORS.text },
});

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
  skipBtn: { alignItems: 'center', marginTop: 14 },
  skipText: { fontSize: 13, color: COLORS.blue },
  verified: { fontSize: 18, fontWeight: '700', color: COLORS.green, marginBottom: 16 },
  vehicleCard: { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  plateDisplay: { fontSize: 28, fontWeight: '800', color: COLORS.amber, letterSpacing: 4, marginBottom: 12 },
  vehicleRow: { flexDirection: 'row', gap: 8, width: '100%' },
  vehicleNote: { fontSize: 12, color: COLORS.muted, marginTop: 8, textAlign: 'center' },
  ulezCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1 },
  ulezTitle: { fontSize: 14, fontWeight: '800' },
  ulezSub: { fontSize: 12, color: COLORS.muted, marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderColor: COLORS.border },
  rowLabel: { fontSize: 13, color: COLORS.muted },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  back: { alignItems: 'center', marginTop: 12 },
  backText: { fontSize: 13, color: COLORS.blue },
});
