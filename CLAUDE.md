# NoFine — AI Context

PCO (Private Hire) sürücüler için havalimanı drop-off ve Londra ücret bölgesi yönetim uygulaması.
GPS ile otomatik algılama, bildirim ve ödeme takibi yapar.

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

**1. Havalimanı Drop-off Algılama**
```
Zone'a gir → 30sn bekle → entry confirmed
Zone'dan çık → 30sn bekle → süre hesapla
2–30 dk arası → drop-off detected → notification (Yes/No butonlu) + popup
< 2dk → ignore (sadece geçti)
> 30dk → ignore (park etti)
```

**2. CCZ Günlük Ücret**
```
CCZ zone'a gir → saat kontrolü → bugün zaten ödendi mi?
Hayır → direkt £15 charge + notification (popup yok)
Evet → ignore
```

### State Persistence
App kill edilse bile GPS state kaybolmaz:
- Entry/exit bilgileri AsyncStorage'a kaydedilir (`nf_gps_state`)
- Background task yeniden başlayınca state restore edilir

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
- `DETECTION_ZONES` → GPS algılama için terminal bazlı hassas sınırlar (polygon + radius)
- `CCZ_ZONE` → CCZ config (dropoffDetection.ts kullanır)

### Aktif Havalimanları
| ID | İsim | Ücret |
|---|---|---|
| heathrow_t2/t3/t4/t5 | Heathrow Terminals | £7 flat per entry |
| gatwick_north/south | Gatwick North/South | 0–10dk: £10, +£1/dk |
| stansted | Stansted | 0–15dk: £10, 15–30dk: £28 |
| luton | Luton | 0–10dk: £7, +£1/dk |
| london_city | London City | 0–5dk: £8, +£1/dk |
| ccz | Congestion Charge Zone | £15/gün (Pzt–Cum 07–18, Cmt 12–18) |
| ulez | ULEZ | Onboarding'de DVLA ile kontrol, aktif detection yok |

### Fee Hesaplama (`calculateAirportFee` in dropoffDetection.ts)
```
heathrow    → flat baseFee (£7)
stansted    → ≤15dk: £10 · >15dk: £28
luton       → ≤10dk: £7 · sonrası +£1/dk
gatwick     → ≤10dk: £10 · sonrası +£1/dk
london_city → ≤5dk: £8 · sonrası +£1/dk
```

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
| `nf_gps_state` | GPS tracking state (kill-safe persistence) |

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

- ULEZ detection aktif değil, sadece onboarding'de compliance check var.
- CCZ `cczChargedDate` memory'de — app restart'ta sıfırlanır ama `nf_gps_state`'e persist ediliyor.
- Polygon boundary'ler Google Maps'ten alındı, gerçek havalimanı testinde ince ayar gerekebilir.
- Gece 23:00 bildirim (`scheduleMidnightReminder`) her gün çalışıyor — trip olmasa da. İleride koşullu yapılacak.
- Railway backend Nisan 2026 sonu free plan bitiyor — Hobby $5/ay'a geçilecek veya Supabase+Vercel'e migrate.
- `api.ts` zone verisi içermiyor, `zones.ts`'den re-export ediyor.
- `locationService.ts`, `gps.ts`, `gpsState.ts` silindi — eski GPS sistemi, `dropoffDetection.ts` kullanılıyor.
