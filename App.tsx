import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Storage, UserData } from './src/services/storage';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { COLORS } from './src/services/api';
import { LocationService } from './src/services/locationService';
import { setConfirmationCallback, confirmDropoff, discardDropoff } from './src/services/dropoffDetection';
import { NotificationService, scheduleMidnightReminder } from './src/services/notifications';

type Tab = 'home' | 'tracking' | 'history';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [showSettings, setShowSettings] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const started = useRef(false);
  const [pendingVisit, setPendingVisit] = useState<any>(null);

  const loadUser = async () => {
    try {
      const u = await Storage.getUser();
      setUser(u);
      if (u && !started.current) {
        started.current = true;
        await NotificationService.requestPermission();
        scheduleMidnightReminder();
        await LocationService.start();
      setConfirmationCallback((visit) => {
        setPendingVisit(visit);
      });
      }
    } catch (e) {
      console.log('loadUser error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUser(); }, []);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={COLORS.green} size="large" />
    </View>
  );

  if (!user) return <SafeAreaProvider><OnboardingScreen onDone={loadUser} /></SafeAreaProvider>;

  return (
    <SafeAreaProvider>
      <View style={s.root}>
        <View style={s.content}>
          {tab === 'home' && <HomeScreen user={user} onOpenSettings={() => setShowSettings(true)} gpsEnabled={gpsEnabled} onToggleGPS={() => setGpsEnabled(p => !p)} />}
          {tab === 'tracking' && <TrackingScreen user={user} gpsEnabled={gpsEnabled} />}
          {tab === 'history' && <HistoryScreen />}
        </View>
        <View style={s.nav}>
          <NavTab icon="🏠" label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
          <NavTab icon="📍" label="Tracking" active={tab === 'tracking'} onPress={() => setTab('tracking')} />
          <NavTab icon="📋" label="History" active={tab === 'history'} onPress={() => setTab('history')} />
        </View>
        {pendingVisit && (
        <Modal visible={true} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#13151e', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#F5A623' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8 }}>✈️ {pendingVisit.zoneName}</Text>
              <Text style={{ fontSize: 14, color: '#687090', marginBottom: 8 }}>Entry: {new Date(pendingVisit.entryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
              <Text style={{ fontSize: 14, color: '#687090', marginBottom: 20 }}>Exit: {new Date(pendingVisit.exitTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
              <Text style={{ fontSize: 16, color: '#fff', marginBottom: 24, fontWeight: '600' }}>Did you drop off passengers?</Text>
              <TouchableOpacity style={{ backgroundColor: '#1DB954', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10 }} onPress={() => { confirmDropoff(pendingVisit); setPendingVisit(null); }}>
                <Text style={{ color: '#000', fontWeight: '800', fontSize: 16 }}>Yes — Record £{pendingVisit.fee.toFixed(2)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ backgroundColor: '#13151e', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#343A52' }} onPress={() => { discardDropoff(pendingVisit); setPendingVisit(null); }}>
                <Text style={{ color: '#687090', fontWeight: '600', fontSize: 16 }}>No — Not a drop-off</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      <View style={{ position: 'absolute', bottom: 100, right: 10, zIndex: 999, gap: 6 }}>
        {[
          { id: 'heathrow', name: 'Heathrow', fee: 7, pen: 80, url: 'https://heathrowdropoff.apcoa.com' },
          { id: 'gatwick', name: 'Gatwick', fee: 10, pen: 100, url: 'https://www.gatwickairport.com' },
          { id: 'stansted', name: 'Stansted', fee: 10, pen: 100, url: 'https://pay.stanstedairport.com' },
          { id: 'luton', name: 'Luton', fee: 7, pen: 95, url: 'https://lutondropoff.apcoa.com' },
          { id: 'london_city', name: 'London City', fee: 8, pen: 80, url: 'https://www.londoncityairport.com' },
        ].map(z => (
          <TouchableOpacity
            key={z.id}
            style={{ backgroundColor: '#F5A623', padding: 8, borderRadius: 8 }}
            onPress={() => {
              const { handleZoneDetection } = require('./src/services/dropoffDetection');
              const now = Date.now();
              // Entry 5 min ago
              handleZoneDetection(z.id, z.name, z.fee, z.pen, z.url, true, now - 300000);
              // Wait 2 sec then send exit with timestamps that bypass jitter
              setTimeout(() => {
                const t = Date.now();
                handleZoneDetection(z.id, z.name, z.fee, z.pen, z.url, false, t - 35000);
              }, 500);
              setTimeout(() => {
                const t = Date.now();
                handleZoneDetection(z.id, z.name, z.fee, z.pen, z.url, false, t - 35000);
              }, 2000);
            }}
          >
            <Text style={{ color: '#000', fontWeight: '800', fontSize: 10 }}>✈️ {z.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet">
          <SettingsScreen user={user} onClose={() => { setShowSettings(false); loadUser(); }} onReset={() => { setShowSettings(false); setUser(null); }} />
        </Modal>
      </View>
    </SafeAreaProvider>
  );
}

function NavTab({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.navTab} onPress={onPress}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={[s.navLabel, { color: active ? COLORS.green : COLORS.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1 },
  nav: { flexDirection: 'row', backgroundColor: COLORS.surface, borderTopWidth: 1, borderColor: COLORS.border, paddingBottom: 28, paddingTop: 10 },
  navTab: { flex: 1, alignItems: 'center', gap: 4 },
  navLabel: { fontSize: 10, fontWeight: '600' },
});
