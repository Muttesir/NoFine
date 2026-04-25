# NoFine — AI Context

PCO (Private Hire) sürücüler için havalimanı drop-off ve Londra ücret bölgesi yönetim uygulaması.
GPS ile otomatik algılama, bildirim ve ödeme takibi yapar.

---

## Uzun Vadeli Hedef

NoFine'ın amacı, sürücülerin havalimanı drop-off ücretlerini unutarak ceza almalarını önlemek için kullanıcı davranışına dayalı akıllı bir sistem geliştirmektir.

Uygulama, GPS verisi ve kullanıcı onayı ("YES") ile gerçek drop-off noktalarını tespit eder ve bu verileri zaman içinde toplayarak kendi konum doğruluğunu sürekli iyileştirir — **self-learning location intelligence system**.

---

## Eklenecek Modüller

| Modül | Durum | Açıklama |
|---|---|---|
| 📍 Drop-off veri toplama | ✅ Kısmen hazır | `dropoffStorage.ts` + `captureDropoffPoint()` — kullanıcı "YES" deyince GPS noktası AsyncStorage'a kaydediliyor |
| ☁️ Backend senkronizasyonu | ⏳ Bekliyor | Toplanan noktaları Railway'e gönder — veri toplama stabil olunca eklenecek |
| 🧹 Veri temizleme / outlier filtering | ⏳ Bekliyor | Anormal noktaları filtrele, tutarlı veriyi seç |
| 🧠 Clustering algoritması | ⏳ Bekliyor | Gelen noktaları analiz edip zone merkezi ve yarıçapını otomatik hesapla |
| 📐 Otomatik zone güncelleme | ⏳ Bekliyor | Cluster sonuçlarına göre `zones.ts` koordinatlarını güncelle |
| 📊 Harita / debug görünümü | ⏳ Bekliyor | Toplanan noktaları ve mevcut zone'ları haritada göster |

---

## Tech Stack

| Katman | Teknoloji |
|---|---|
| Mobile App | React Native + Expo SDK 54, TypeScript |
| Navigation | React Navigation (bottom tabs) |
| Backend | Node.js + Express |
| Hosting | Railway (`https://nofine-production.up.railway.app`) |
| Storage (local) | AsyncStorage |
| GPS | expo-location (foreground + background task) |
| Notifications | expo-notifications |
| Repo | github.com/Muttesir/NoFine |
| Bundle ID | com.muto4446.nofine |
| EAS Project | 00069aa7-b1a0-4435-a504-96639422d5de |

---

## Proje Yapısı

```
NoFine/
├── App.tsx                          # Root: navigation, GPS başlatma, drop-off popup
├── app.json                         # Expo config (permissions, bundle ID)
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx           # Ana ekran: charges, stats, zone grid
│   │   ├── TrackingScreen.tsx       # Canlı GPS, zone mesafeleri
│   │   ├── HistoryScreen.tsx        # Ödeme geçmişi
│   │   ├── SettingsScreen.tsx       # İsim, plaka değiştirme
│   │   └── OnboardingScreen.tsx     # İlk kurulum, DVLA plaka doğrulama
│   └── services/
│       ├── zones.ts                 # TEK KAYNAK — tüm zone verileri burada
│       ├── api.ts                   # BASE_URL, COLORS, API calls, zone re-export
│       ├── dropoffDetection.ts      # GPS core — havalimanı + CCZ algılama + bildirim aksiyonları
│       ├── storage.ts               # AsyncStorage wrapper
│       └── notifications.ts         # Push notification helpers + kategori kurulumu
├── backend/
│   └── src/index.js                 # Express API — zone data, DVLA, fee calc
└── CLAUDE.md                        # Bu dosya
```

---

## Temel Mimari: GPS Sistemi

### Tek sistem: `dropoffDetection.ts`
`App.tsx`'de `DropoffService.start()` ile başlatılır. İki şeyi paralel yapar:

**1. Havalimanı Drop-off Algılama — 3-Nokta Sıralı Sistem (entry → mid → exit)**

Eski polygon tabanlı sistem kaldırıldı. Her terminal için 3 GPS noktası tanımlı:
- **entry** — terminal giriş rampası başı (ilk geçiş noktası)
- **mid** — bırakma alanı (araç burada durur)
- **exit** — terminal çıkış rampası (son geçiş noktası)

Algılama akışı:
```
entry noktasına gir → passedEntry = true
mid noktasına gir (passedEntry=true) → midEntryTime kaydet
  speed > 8.33 m/s (30 km/h) → geçiyor, skip
mid'den çık → süre hesapla:
  2–30 dk → drop-off detected → triggerDropoff()
  < 2dk   → ignore (çok kısa)
  > 30dk  → ignore (park etti)
exit noktasına gir (passedMid=true) → alternatif trigger (süre uygunsa)
```

Her terminal için ayrı `TerminalState` — state'ler in-memory (app restart'ta sıfırlanır, kabul edilebilir).

**2. CCZ Günlük Ücret**
```
CCZ zone'a gir → saat kontrolü → bugün zaten ödendi mi?
Hayır → direkt £15 charge + notification (popup yok)
Evet → ignore
```

### State Persistence
- **Terminal states** (entry/mid geçiş bilgileri) → in-memory only, restart'ta sıfırlanır
- **CCZ + cooldown** → AsyncStorage'a kaydedilir (`nf_gps_state`) — restart-safe
- `nf_gps_state` sadece 3 alan içerir: `{ cooldownUntil, cczIsInside, cczChargedDate }`

### Background Notification Akışı (güncel)
```
Drop-off algılandı → savePendingVisit() → notification gönder (Yes/No butonlarıyla)

Kullanıcı "Yes" butonuna basar → app AÇILMAZ → arka planda confirmDropoff()
Kullanıcı "No" butonuna basar  → app AÇILMAZ → arka planda discardDropoff()
Kullanıcı bildirim gövdesine tıklar → app açılır → checkPendingVisit() → popup
```

Bildirim aksiyonları `dropoffDetection.ts`'de modül seviyesinde kayıtlı
(`Notifications.addNotificationResponseReceivedListener`) — app kill olsa bile arka planda çalışır.

---

## Bildirim Kategorisi

`notifications.ts`'de `setupNotificationCategories()` ile kayıtlı:
- Kategori ID: `dropoff_confirm`
- Aksiyon `YES` → `opensAppToForeground: false`
- Aksiyon `NO`  → `opensAppToForeground: false`, `isDestructive: true`

`App.tsx` startup'ta `setupNotificationCategories()` çağırır.

---

## Zone Verileri

### `zones.ts` — Tek kaynak (buradan düzenle)
- `DISPLAY_ZONES` → UI'da gösterilen zone listesi (HomeScreen, TrackingScreen)
- `TERMINAL_ZONES` → GPS algılama için terminal bazlı 3-nokta sınırlar (`TerminalZone[]`)
- `CCZ_ZONE` → CCZ config (dropoffDetection.ts kullanır)

### Interface'ler

```typescript
interface GeoPoint {
  lat: number;
  lng: number;
  radiusM: number;   // metre cinsinden algılama yarıçapı
}

interface TerminalZone {
  id: string;
  name: string;
  level: 'Upper' | 'Ground';   // viyadük vs zemin kattı
  fee: number;                 // base ücret (£)
  penaltyFee: number;          // ödenmezse ceza (£)
  payUrl: string;              // APCOA veya havalimanı ödeme linki
  entry: GeoPoint;
  mid:   GeoPoint;
  exit:  GeoPoint;
}
```

### Aktif Havalimanları
| ID | İsim | Level | Ücret |
|---|---|---|---|
| heathrow_t2 | Heathrow T2 | Upper | £7 flat |
| heathrow_t3 | Heathrow T3 | Upper | £7 flat |
| heathrow_t4 | Heathrow T4 | Ground | £7 flat |
| heathrow_t5 | Heathrow T5 | Upper | £7 flat |
| gatwick_north | Gatwick North | Upper | 0–10dk: £10, +£1/dk |
| gatwick_south | Gatwick South | Upper | 0–10dk: £10, +£1/dk |
| stansted | Stansted | Ground | 0–15dk: £10, 15–30dk: £28 |
| luton | Luton | Ground | 0–10dk: £7, +£1/dk |
| london_city | London City | Ground | 0–5dk: £8, +£1/dk |
| ccz | Congestion Charge Zone | — | £15/gün (Pzt–Cum 07–18, Cmt 12–18) |
| ulez | ULEZ | — | Onboarding'de DVLA ile kontrol, aktif detection yok |

### Fee Hesaplama (`calculateAirportFee` in dropoffDetection.ts)
```
heathrow    → flat baseFee (£7)
stansted    → ≤15dk: £10 · >15dk: £28
luton       → ≤10dk: £7 · sonrası +£1/dk
gatwick     → ≤10dk: £10 · sonrası +£1/dk
london_city → ≤5dk: £8 · sonrası +£1/dk
```

### Koordinat Notları (WGS84 decimal degrees)
- Tüm koordinatlar Google Maps / açık havalimanı haritalarından alındı
- `level: 'Upper'` terminaller viyadük (~7m yükseklik) üzerinde — GPS bazen alt kattaki park ile karışabilir
- Gerçek test sonrası `radiusM` değerleri ince ayar gerektirebilir
- London City koordinatları Hartmann Road bırakma alanına göre: entry `(51.5048, 0.0512)` → exit `(51.5056, 0.0542)`

---

## UI — Charge Kartı Tasarımı

Gerçek APCOA ceza kağıdından ilham alınarak tasarlandı:
- Lacivert (`#0a1628`) header — "PARKING CHARGE NOTICE" + sarı plaka
- Sarı/siyah hazard şerit (skewX diagonal)
- Siyah zemin üzerine büyük sarı ücret (`£X.XX`)
- Tablo detaylar: location, entry time, duration
- Deadline countdown (urgency rengi)
- "PAY NOW →" + "✓ Mark Paid" butonları

---

## Backend API (Railway)

```
GET  /health                    → versiyon, uptime
GET  /api/zones                 → tüm zone listesi
POST /api/dvla/lookup           → { plate } → araç bilgisi
GET  /api/ulez-check?plate=     → ULEZ uyumluluğu
POST /api/zone-entry            → { plate, zoneId }
POST /api/zone-exit             → { plate, zoneId, exitedAt }
POST /api/register-token        → { plate, token } → push token kayıt
```

**Env vars (Railway'de):**
- `DVLA_API_KEY` — DVLA Vehicle Enquiry API key

---

## Storage Keys (AsyncStorage)

| Key | İçerik |
|---|---|
| `nf_user` | { name, plate, make, colour, year } |
| `nf_charges` | Ödenmemiş charge listesi |
| `nf_history` | Ödenen charge geçmişi (max 100) |
| `nf_pending_visit` | Onay bekleyen drop-off (popup için) |
| `nf_gps_state` | `{ cooldownUntil, cczIsInside, cczChargedDate }` — sadece 3 alan |

---

## Build & Deploy

**Local device build (kablo ile):**
```bash
cd ~/Desktop/NoFine
npx expo run:ios --configuration Release --device 00008110-000A0C800252401E
```

**App Store / TestFlight (Xcode ile):**
```
Xcode → Any iOS Device (arm64) → Product → Archive
→ Distribute App → App Store Connect → Upload
```

**App Store / TestFlight (cloud build):**
```bash
eas build --platform ios --profile production --auto-submit
```

**Backend deploy:**
Railway otomatik deploy eder — GitHub main'e push yeterli.

---

## Önemli Notlar

- **GPS sistemi 3-nokta modeline geçildi** (Nisan 2026) — eski polygon/`DETECTION_ZONES` sistemi tamamen kaldırıldı.
- `api.ts` zone verisi içermiyor, `zones.ts`'den re-export ediyor (`TERMINAL_ZONES`, `TerminalZone`).
- `locationService.ts`, `gps.ts`, `gpsState.ts` silindi — eski GPS sistemi, `dropoffDetection.ts` kullanılıyor.
- ULEZ detection aktif değil, sadece onboarding'de compliance check var.
- CCZ `cczChargedDate` `nf_gps_state`'e persist ediliyor — app restart'ta kaybolmaz.
- Terminal state'leri (entry/mid geçişleri) in-memory — app restart'ta sıfırlanır, bu kasıtlı bir tercih.
- Gece 23:00 bildirimi (`scheduleMidnightReminder`) **kaldırıldı** (Nisan 2026) — her gece tetikleniyordu, trip olmasa da. İleride koşullu yapılacak: o gün ödenmemiş charge varsa ve gece yarısı deadline'ı yaklaşıyorsa 23:00'de hatırlatma gönder. `Storage.getCharges()` → `filter(c => !c.paid)` → boş değilse bildirim planla.
- Railway backend Nisan 2026 sonu free plan bitiyor — Hobby $5/ay'a geçilecek veya Supabase+Vercel'e migrate.
- Speed filtresi: mid noktasında `speed > 2.78 m/s` (6 mph) → drop-off sayılmaz, araç geçiyordur.
