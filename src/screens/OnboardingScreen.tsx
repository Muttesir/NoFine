import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';

import { Storage } from '../services/storage';
import { API, COLORS, BASE_URL } from '../services/api';

interface VehicleData {
  plate: string;
  make: string;
  colour: string;
  year: number | null;
  verified: boolean;
}

interface UlezData {
  plate: string;
  year: number;
  fuelType: string;
  ulezCompliant: boolean;
  charge: number;
}

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step,    setStep]    = useState(1);
  const [name,    setName]    = useState('');
  const [plate,   setPlate]   = useState('');
  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [ulez,    setUlez]    = useState<UlezData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notUK,   setNotUK]   = useState(false);

  const verify = async () => {
    setLoading(true);
    try {
      const data = await API.dvlaLookup(plate.trim()) as unknown as VehicleData;
      setVehicle(data);
      const ulezRes  = await fetch(`${BASE_URL}/api/ulez-check?plate=${encodeURIComponent(plate.trim())}`);
      const ulezData = await ulezRes.json() as UlezData;
      setUlez(ulezData);
      setStep(2);
    } catch {
      Alert.alert('Error', 'Could not verify plate. Is it a UK registered vehicle?');
    } finally {
      setLoading(false);
    }
  };

  const skipVerify = () => {
    setVehicle({ plate: plate.trim().toUpperCase(), make: 'UNKNOWN', colour: 'UNKNOWN', year: null, verified: false });
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
      year: vehicle?.year ?? undefined,
      extraPlates: [],
    });
    onDone();
  };

  const canVerify = name.trim().length > 0 && plate.trim().length > 0;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Logo */}
        <View style={s.logo}>
          <Text style={s.logoText}>NoFine</Text>
          <Text style={s.logoSub}>Know Before You Owe</Text>
        </View>

        {/* Step 1 */}
        {step === 1 && (
          <View style={s.card}>
            <FieldLabel label="Your Name" />
            <TextInput
              style={s.input}
              placeholder="Your name"
              placeholderTextColor={COLORS.dim}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <FieldLabel label="Vehicle Plate" />
            <TextInput
              style={[s.input, s.plateInput]}
              placeholder="AB12 CDE"
              placeholderTextColor={COLORS.dim}
              value={plate}
              onChangeText={t => setPlate(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[s.btn, !canVerify && { opacity: 0.4 }]}
              onPress={verify}
              disabled={loading || !canVerify}
            >
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnText}>Verify UK Plate →</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.skipBtn}
              onPress={() => {
                if (!canVerify) { Alert.alert('Please enter your name and plate first'); return; }
                skipVerify();
              }}
            >
              <Text style={s.skipText}>Not a UK registered vehicle?</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <View style={s.card}>
            <Text style={s.verified}>{notUK ? '⚠️  Non-UK Vehicle' : '✓  Plate Verified'}</Text>

            {/* Plate + vehicle info */}
            <View style={s.vehicleCard}>
              <Text style={s.plateDisplay}>{plate.toUpperCase()}</Text>
              {!notUK && vehicle && (
                <View style={s.badgeRow}>
                  <VehicleBadge label="Make"   value={vehicle.make   || 'N/A'} />
                  <VehicleBadge label="Year"   value={vehicle.year ? String(vehicle.year) : 'N/A'} />
                  <VehicleBadge label="Colour" value={vehicle.colour || 'N/A'} />
                </View>
              )}
              {notUK && (
                <Text style={s.vehicleNote}>ULEZ/CCZ charges may apply — check manually</Text>
              )}
            </View>

            {/* ULEZ status */}
            {ulez && !notUK && (
              <View style={[s.ulezCard, {
                backgroundColor: ulez.ulezCompliant ? COLORS.greenDim : COLORS.redDim,
                borderColor: ulez.ulezCompliant ? COLORS.green + '44' : COLORS.red + '44',
              }]}>
                <Text style={{ fontSize: 22 }}>{ulez.ulezCompliant ? '✅' : '⚠️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ulezTitle, { color: ulez.ulezCompliant ? COLORS.green : COLORS.red }]}>
                    {ulez.ulezCompliant ? 'ULEZ Exempt' : 'ULEZ Charge Applies'}
                  </Text>
                  <Text style={s.ulezSub}>
                    {ulez.ulezCompliant
                      ? 'Your vehicle is exempt from ULEZ charges'
                      : `£${ulez.charge}/day when driving in London`}
                  </Text>
                </View>
              </View>
            )}

            {/* Driver row */}
            <View style={s.driverRow}>
              <Text style={s.driverLabel}>Driver</Text>
              <Text style={s.driverValue}>{name}</Text>
            </View>

            <TouchableOpacity style={s.btn} onPress={finish}>
              <Text style={s.btnText}>Start Driving 🚗</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.backBtn} onPress={() => { setStep(1); setNotUK(false); }}>
              <Text style={s.backText}>← Change plate</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>{label}</Text>;
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
  badge: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 9, color: COLORS.muted, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  value: { fontSize: 12, fontWeight: '700', color: COLORS.text },
});

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.bg },
  scroll:      { flexGrow: 1, justifyContent: 'center', padding: 24 },

  logo:        { alignItems: 'center', marginBottom: 36 },
  logoText:    { fontSize: 44, fontWeight: '800', color: COLORS.green, letterSpacing: -1, marginBottom: 6 },
  logoSub:     { fontSize: 13, color: COLORS.muted },

  card:        { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  input:       { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 13, fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  plateInput:  { fontSize: 24, fontWeight: '800', color: COLORS.amber, letterSpacing: 4, textAlign: 'center', marginBottom: 4 },

  btn:         { backgroundColor: COLORS.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  btnText:     { fontSize: 16, fontWeight: '800', color: '#000' },
  skipBtn:     { alignItems: 'center', marginTop: 14 },
  skipText:    { fontSize: 13, color: COLORS.blue },

  verified:    { fontSize: 16, fontWeight: '700', color: COLORS.green, marginBottom: 16 },

  vehicleCard: { backgroundColor: COLORS.surface2, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  plateDisplay:{ fontSize: 28, fontWeight: '800', color: COLORS.amber, letterSpacing: 4, marginBottom: 14 },
  badgeRow:    { flexDirection: 'row', gap: 8, width: '100%' },
  vehicleNote: { fontSize: 12, color: COLORS.muted, marginTop: 8, textAlign: 'center' },

  ulezCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1 },
  ulezTitle:   { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  ulezSub:     { fontSize: 12, color: COLORS.muted, lineHeight: 18 },

  driverRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  driverLabel: { fontSize: 13, color: COLORS.muted },
  driverValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  backBtn:     { alignItems: 'center', marginTop: 12 },
  backText:    { fontSize: 13, color: COLORS.blue },
});
