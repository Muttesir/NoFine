import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Storage, UserData } from "./src/services/storage";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import TrackingScreen from "./src/screens/TrackingScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { COLORS } from "./src/services/api";
import { DropoffService, onDropoffDetected, confirmDropoff, discardDropoff, DropoffVisit } from "./src/services/dropoffDetection";
import { NotificationService, scheduleMidnightReminder } from "./src/services/notifications";

type Tab = "home" | "tracking" | "history";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [showSettings, setShowSettings] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [pendingVisit, setPendingVisit] = useState<DropoffVisit | null>(null);
  const started = useRef(false);

  const loadUser = async () => {
    try {
      const u = await Storage.getUser();
      setUser(u);
      if (u && !started.current) {
        started.current = true;
        await NotificationService.requestPermission();
        scheduleMidnightReminder();
        onDropoffDetected((visit) => setPendingVisit(visit));
        await DropoffService.start();
      }
    } catch (e) {
      console.log("loadUser error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUser(); }, []);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={COLORS.green} size="large" />
    </View>
  );

  if (!user) return <SafeAreaProvider><OnboardingScreen onDone={loadUser} /></SafeAreaProvider>;

  return (
    <SafeAreaProvider>
      <View style={s.root}>
        <View style={s.content}>
          {tab === "home" && <HomeScreen user={user} onOpenSettings={() => setShowSettings(true)} gpsEnabled={gpsEnabled} onToggleGPS={() => setGpsEnabled(p => !p)} />}
          {tab === "tracking" && <TrackingScreen user={user} gpsEnabled={gpsEnabled} />}
          {tab === "history" && <HistoryScreen />}
        </View>

        <View style={s.nav}>
          <NavTab icon="🏠" label="Home" active={tab === "home"} onPress={() => setTab("home")} />
          <NavTab icon="📍" label="Tracking" active={tab === "tracking"} onPress={() => setTab("tracking")} />
          <NavTab icon="📋" label="History" active={tab === "history"} onPress={() => setTab("history")} />
        </View>

        {/* Drop-off confirmation popup */}
        {pendingVisit && (
          <Modal visible={true} transparent animationType="fade">
            <View style={s.overlay}>
              <View style={s.popup}>
                <Text style={s.popupEmoji}>✈️</Text>
                <Text style={s.popupTitle}>{pendingVisit.zoneName}</Text>
                <Text style={s.popupTime}>
                  Entry: {new Date(pendingVisit.entryTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  {"  "}·{"  "}
                  Exit: {new Date(pendingVisit.exitTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text style={s.popupDuration}>{Math.round(pendingVisit.durationMin)} min</Text>
                <Text style={s.popupQuestion}>Did you drop off passengers?</Text>
                <TouchableOpacity style={s.yesBtn} onPress={() => { confirmDropoff(pendingVisit!); setPendingVisit(null); loadUser(); }}>
                  <Text style={s.yesBtnText}>Yes — Record £{pendingVisit.fee.toFixed(2)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.noBtn} onPress={() => { discardDropoff(); setPendingVisit(null); }}>
                  <Text style={s.noBtnText}>No — Not a drop-off</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
        <View style={{ position: 'absolute', bottom: 100, right: 10, zIndex: 999, gap: 4 }}>
          {[
            { id: "heathrow_t2", name: "LHR T2", fee: 7, pen: 80, url: "https://heathrowdropoff.apcoa.com/trip/vrn" },
            { id: "heathrow_t3", name: "LHR T3", fee: 7, pen: 80, url: "https://heathrowdropoff.apcoa.com/trip/vrn" },
            { id: "heathrow_t4", name: "LHR T4", fee: 7, pen: 80, url: "https://heathrowdropoff.apcoa.com/trip/vrn" },
            { id: "heathrow_t5", name: "LHR T5", fee: 7, pen: 80, url: "https://heathrowdropoff.apcoa.com/trip/vrn" },
            { id: "gatwick_north", name: "GTW N", fee: 10, pen: 100, url: "https://www.gatwickairport.com" },
            { id: "gatwick_south", name: "GTW S", fee: 10, pen: 100, url: "https://www.gatwickairport.com" },
            { id: "stansted", name: "STN", fee: 10, pen: 100, url: "https://pay.stanstedairport.com" },
            { id: "luton", name: "LTN", fee: 7, pen: 95, url: "https://lutondropoff.apcoa.com" },
            { id: "london_city", name: "LCY", fee: 8, pen: 80, url: "https://www.londoncityairport.com" },
          ].map(z => (
            <TouchableOpacity
              key={z.id}
              style={{ backgroundColor: '#F5A623', padding: 6, borderRadius: 6 }}
              onPress={() => setPendingVisit({ zoneId: z.id, zoneName: z.name, fee: z.fee, penaltyFee: z.pen, payUrl: z.url, entryTime: Date.now() - 300000, exitTime: Date.now(), durationMin: 5 })}
            >
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 9 }}>✈️ {z.name}</Text>
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
  nav: { flexDirection: "row", backgroundColor: COLORS.surface, borderTopWidth: 1, borderColor: COLORS.border, paddingBottom: 28, paddingTop: 10 },
  navTab: { flex: 1, alignItems: "center", gap: 4 },
  navLabel: { fontSize: 10, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 24 },
  popup: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: COLORS.amber + "88", alignItems: "center" },
  popupEmoji: { fontSize: 40, marginBottom: 8 },
  popupTitle: { fontSize: 24, fontWeight: "800", color: COLORS.text, marginBottom: 6 },
  popupTime: { fontSize: 13, color: COLORS.muted, marginBottom: 4 },
  popupDuration: { fontSize: 13, color: COLORS.amber, fontWeight: "700", marginBottom: 16 },
  popupQuestion: { fontSize: 16, color: COLORS.text, fontWeight: "600", marginBottom: 20, textAlign: "center" },
  yesBtn: { backgroundColor: COLORS.green, borderRadius: 12, padding: 16, alignItems: "center", width: "100%", marginBottom: 10 },
  yesBtnText: { color: "#000", fontWeight: "800", fontSize: 16 },
  noBtn: { backgroundColor: COLORS.surface2, borderRadius: 12, padding: 16, alignItems: "center", width: "100%", borderWidth: 1, borderColor: COLORS.border },
  noBtnText: { color: COLORS.muted, fontWeight: "600", fontSize: 16 },
});
