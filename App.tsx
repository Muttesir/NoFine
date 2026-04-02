import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Storage, UserData } from './src/services/storage';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { COLORS } from './src/services/api';
import { GPS } from './src/services/gps';
import { NotificationService } from './src/services/notifications';

type Tab = 'home' | 'tracking' | 'history';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [showSettings, setShowSettings] = useState(false);

  const loadUser = async () => {
    const u = await Storage.getUser();
    setUser(u);
    setLoading(false);
    if (u) {
      GPS.start();
      NotificationService.requestPermission();
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
          {tab === 'home' && <HomeScreen user={user} onOpenSettings={() => setShowSettings(true)} />}
          {tab === 'tracking' && <TrackingScreen user={user} />}
          {tab === 'history' && <HistoryScreen />}
        </View>
        <View style={s.nav}>
          <NavTab icon="🏠" label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
          <NavTab icon="📍" label="Tracking" active={tab === 'tracking'} onPress={() => setTab('tracking')} />
          <NavTab icon="📋" label="History" active={tab === 'history'} onPress={() => setTab('history')} />
        </View>
        <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet">
          <SettingsScreen user={user} onClose={() => { setShowSettings(false); loadUser(); }}
 onReset={() => { setShowSettings(false); setUser(null); }} />
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
