import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, AppState } from "react-native";
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
import * as Notifications from "expo-notifications";

type Tab = "home" | "tracking" | "history";

export default function App() {
  const [loading,      setLoading]      = useState(true);
  const [user,         setUser]         = useState<UserData | null>(null);
  const [tab,          setTab]          = useState<Tab>("home");
  const [showSettings, setShowSettings] = useState(false);
  const [gpsEnabled,   setGpsEnabled]   = useState(true);
  const [pendingVisit, setPendingVisit] = useState<DropoffVisit | null>(null);
  const started = useRef(false);

  const checkPendingVisit = async () => {
    const pending = await Storage.getPendingVisit();
    if (pending) setPendingVisit(pending);
  };

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
      await checkPendingVisit();
    } catch (e) {
      console.log("loadUser error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();

    const notifSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as any;
      if (data?.type === "dropoff_pending") await checkPendingVisit();
    });

    const appStateSub = AppState.addEventListener("change", async (state) => {
      if (state === "active") await checkPendingVisit();
    });

    return () => { notifSub.remove(); appStateSub.remove(); };
  }, []);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={COLORS.green} size="large" />
    </View>
  );

  if (!user) return <SafeAreaProvider><OnboardingScreen onDone={loadUser} /></SafeAreaProvider>;

  return (
    <SafeAreaProvider>
      <View style={s.root}>
        {/* Main content */}
        <View style={s.content}>
          {tab === "home" && (
            <HomeScreen
              user={user}
              onOpenSettings={() => setShowSettings(true)}
              gpsEnabled={gpsEnabled}
              onToggleGPS={async () => {
                const next = !gpsEnabled;
                setGpsEnabled(next);
                if (next) { await DropoffService.start(); } else { await DropoffService.stop(); }
              }}
            />
          )}
          {tab === "tracking" && <TrackingScreen user={user} gpsEnabled={gpsEnabled} />}
          {tab === "history"  && <HistoryScreen />}
        </View>

        {/* Tab bar */}
        <View style={s.nav}>
          <NavTab icon="🏠" label="Home"     active={tab === "home"}     onPress={() => setTab("home")} />
          <NavTab icon="📍" label="Tracking" active={tab === "tracking"} onPress={() => setTab("tracking")} />
          <NavTab icon="📋" label="History"  active={tab === "history"}  onPress={() => setTab("history")} />
        </View>

        {/* Drop-off confirmation modal */}
        {pendingVisit && (
          <Modal visible transparent animationType="fade">
            <View style={s.overlay}>
              <View style={s.popup}>
                <Text style={s.popupEmoji}>✈️</Text>
                <Text style={s.popupZone}>{pendingVisit.zoneName}</Text>
                <Text style={s.popupTime}>
                  Entry: {new Date(pendingVisit.entryTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  {"  ·  "}
                  Exit: {new Date(pendingVisit.exitTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text style={s.popupDuration}>{Math.round(pendingVisit.durationMin)} min</Text>
                <Text style={s.popupQuestion}>Did you drop off passengers?</Text>

                <TouchableOpacity
                  style={s.yesBtn}
                  onPress={async () => {
                    await confirmDropoff(pendingVisit!);
                    await Storage.clearPendingVisit();
                    setPendingVisit(null);
                    loadUser();
                  }}
                >
                  <Text style={s.yesBtnText}>Yes — Record £{pendingVisit.fee.toFixed(2)}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.noBtn}
                  onPress={async () => {
                    discardDropoff();
                    await Storage.clearPendingVisit();
                    setPendingVisit(null);
                  }}
                >
                  <Text style={s.noBtnText}>No — Not a drop-off</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* Settings modal */}
        <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet">
          <SettingsScreen
            user={user}
            onClose={() => { setShowSettings(false); loadUser(); }}
            onReset={() => { setShowSettings(false); setUser(null); }}
          />
        </Modal>
      </View>
    </SafeAreaProvider>
  );
}

function NavTab({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.navTab} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.navIconWrap, active && { backgroundColor: COLORS.green + "18" }]}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={[s.navLabel, { color: active ? COLORS.green : COLORS.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: COLORS.bg },
  content:      { flex: 1 },

  // Tab bar
  nav:          { flexDirection: "row", backgroundColor: COLORS.surface, borderTopWidth: 1, borderColor: COLORS.border, paddingBottom: 28, paddingTop: 8, paddingHorizontal: 8 },
  navTab:       { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 },
  navIconWrap:  { width: 44, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  navLabel:     { fontSize: 10, fontWeight: "700" },

  // Drop-off modal
  overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", padding: 24 },
  popup:        {
    backgroundColor: COLORS.surface, borderRadius: 24, padding: 24,
    borderWidth: 1.5, borderColor: COLORS.amber + "88", alignItems: "center",
    shadowColor: COLORS.amber, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 24,
  },
  popupEmoji:   { fontSize: 44, marginBottom: 10 },
  popupZone:    { fontSize: 22, fontWeight: "800", color: COLORS.text, marginBottom: 8, textAlign: "center", letterSpacing: -0.3 },
  popupTime:    { fontSize: 13, color: COLORS.muted, marginBottom: 4 },
  popupDuration:{ fontSize: 14, color: COLORS.amber, fontWeight: "700", marginBottom: 18 },
  popupQuestion:{ fontSize: 16, color: COLORS.text, fontWeight: "600", marginBottom: 22, textAlign: "center" },
  yesBtn:       { backgroundColor: COLORS.green, borderRadius: 14, padding: 16, alignItems: "center", width: "100%", marginBottom: 10 },
  yesBtnText:   { color: "#000", fontWeight: "800", fontSize: 16 },
  noBtn:        { backgroundColor: COLORS.surface2, borderRadius: 14, padding: 16, alignItems: "center", width: "100%", borderWidth: 1, borderColor: COLORS.border },
  noBtnText:    { color: COLORS.muted, fontWeight: "600", fontSize: 16 },
});
