# NoFine — AI Context

App for PCO (Private Hire) drivers to manage airport drop-off charges and London congestion zones.
Automatic GPS detection, push notifications, and payment tracking.

---

## Long-Term Goal

NoFine's mission is to prevent PCO drivers from receiving fines by forgetting to pay airport drop-off charges. The app detects genuine drop-offs using GPS data and user confirmation ("YES"), and continuously improves its own location accuracy over time by learning from collected data — a **self-learning location intelligence system**.

---

## Upcoming Modules

| Module | Status | Description |
|---|---|---|
| 📍 Drop-off data collection | ✅ Partially done | `dropoffStorage.ts` + `captureDropoffPoint()` — GPS point saved to AsyncStorage when user confirms "YES" |
| ☁️ Backend sync | ⏳ Pending | Send collected points to Railway — will be added once data collection is confirmed stable |
| 🧹 Data cleaning / outlier filtering | ⏳ Pending | Filter anomalous points, keep consistent data |
| 🧠 Clustering algorithm | ⏳ Pending | Analyse collected points to auto-calculate zone centre and radius |
| 📐 Auto zone update | ⏳ Pending | Update `zones.ts` coordinates based on cluster results |
| 📊 Map / debug view | ⏳ Pending | Visualise collected points and current zones on a map |

---

## Tech Stack

| Layer | Technology |
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

## Project Structure

```
NoFine/
├── App.tsx                          # Root: navigation, GPS start, drop-off popup
├── app.json                         # Expo config (permissions, bundle ID)
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx           # Main screen: charges, stats, zone grid
│   │   ├── TrackingScreen.tsx       # Live GPS, zone distances
│   │   ├── HistoryScreen.tsx        # Payment history
│   │   ├── SettingsScreen.tsx       # Name and plate update
│   │   └── OnboardingScreen.tsx     # First-run setup, DVLA plate lookup
│   └── services/
│       ├── zones.ts                 # SINGLE SOURCE OF TRUTH — all zone data lives here
│       ├── api.ts                   # BASE_URL, COLORS, API calls, zone re-export
│       ├── dropoffDetection.ts      # GPS core — airport + CCZ detection + notification actions
│       ├── storage.ts               # AsyncStorage wrapper
│       └── notifications.ts         # Push notification helpers + category setup
├── backend/
│   └── src/index.js                 # Express API — zone data, DVLA, fee calc
└── CLAUDE.md                        # This file
```

---

## Core Architecture: GPS System

### Single system: `dropoffDetection.ts`
Started via `DropoffService.start()` in `App.tsx`. Runs two things in parallel:

**1. Airport Drop-off Detection — 3-Point Sequential System (entry → mid → exit)**

The old polygon-based system has been removed. Each terminal has 3 GPS points defined:
- **entry** — start of the terminal entry ramp (first checkpoint)
- **mid** — drop-off lane (vehicle stops here)
- **exit** — terminal exit ramp (final checkpoint)

Detection flow:
```
Enter entry point → passedEntry = true
Enter mid point (passedEntry=true) → record midEntryTime
  speed > 2.78 m/s (6 mph) → passing through, skip
Leave mid → calculate duration:
  2–30 min → drop-off detected → triggerDropoff()
  < 2 min  → ignore (too short)
  > 30 min → ignore (parked)
Enter exit point (passedMid=true) → alternative trigger (if duration valid)
```

Separate `TerminalState` per terminal — states are in-memory (reset on app restart, intentional).

**2. CCZ Daily Charge**
```
Enter CCZ zone → check time → already charged today?
No  → create £15 charge + notification (no popup)
Yes → ignore
```

### State Persistence
- **Terminal states** (entry/mid passage flags) → in-memory only, reset on restart
- **CCZ + cooldown** → saved to AsyncStorage (`nf_gps_state`) — restart-safe
- `nf_gps_state` holds only 3 fields: `{ cooldownUntil, cczIsInside, cczChargedDate }`

### Background Notification Flow
```
Drop-off detected → savePendingVisit() → send notification (with YES/NO buttons)

User taps "YES" button → app does NOT open → confirmDropoff() runs in background
User taps "NO"  button → app does NOT open → discardDropoff() runs in background
User taps notification body → app opens → checkPendingVisit() → popup shown
```

Notification actions are registered at module level in `dropoffDetection.ts`
(`Notifications.addNotificationResponseReceivedListener`) — fires even if app was killed.

---

## Notification Category

Registered via `setupNotificationCategories()` in `notifications.ts`:
- Category ID: `dropoff_confirm`
- Action `YES` → `opensAppToForeground: false`
- Action `NO`  → `opensAppToForeground: false`, `isDestructive: true`

`App.tsx` calls `setupNotificationCategories()` on startup.

---

## Zone Data

### `zones.ts` — Single source (edit here only)
- `DISPLAY_ZONES` → zone list shown in UI (HomeScreen, TrackingScreen)
- `TERMINAL_ZONES` → terminal-based 3-point boundaries for GPS detection (`TerminalZone[]`)
- `CCZ_ZONE` → CCZ config used by dropoffDetection.ts

### Interfaces

```typescript
interface GeoPoint {
  lat: number;
  lng: number;
  radiusM: number;   // detection radius in metres
}

interface TerminalZone {
  id: string;
  name: string;
  level: 'Upper' | 'Ground';   // elevated viaduct vs ground floor
  fee: number;                 // base charge (£)
  penaltyFee: number;          // penalty if unpaid (£)
  payUrl: string;              // APCOA or airport payment link
  entry: GeoPoint;
  mid:   GeoPoint;
  exit:  GeoPoint;
}
```

### Active Airports
| ID | Name | Level | Charge |
|---|---|---|---|
| heathrow_t2 | Heathrow T2 | Upper | £7 flat |
| heathrow_t3 | Heathrow T3 | Upper | £7 flat |
| heathrow_t4 | Heathrow T4 | Ground | £7 flat |
| heathrow_t5 | Heathrow T5 | Upper | £7 flat |
| gatwick_north | Gatwick North | Upper | 0–10min: £10, +£1/min |
| gatwick_south | Gatwick South | Upper | 0–10min: £10, +£1/min |
| stansted | Stansted | Ground | 0–15min: £10, 15–30min: £28 |
| luton | Luton | Ground | 0–10min: £7, +£1/min |
| london_city | London City | Ground | 0–5min: £8, +£1/min |
| ccz | Congestion Charge Zone | — | £15/day (Mon–Fri 07–18, Sat 12–18) |
| ulez | ULEZ | — | Compliance check on onboarding only, no active detection |

### Fee Calculation (`calculateAirportFee` in dropoffDetection.ts)
```
heathrow    → flat baseFee (£7)
stansted    → ≤15min: £10 · >15min: £28
luton       → ≤10min: £7 · then +£1/min
gatwick     → ≤10min: £10 · then +£1/min
london_city → ≤5min: £8 · then +£1/min
```

### Coordinate Notes (WGS84 decimal degrees)
- All coordinates sourced from Google Maps and official airport maps
- `level: 'Upper'` terminals are on the elevated viaduct (~7m high) — GPS may occasionally confuse with ground floor car park
- `radiusM` values may need fine-tuning after real-world testing
- London City coordinates based on Hartmann Road drop-off area: entry `(51.5048, 0.0512)` → exit `(51.5056, 0.0542)`

---

## UI — Charge Card Design

Inspired by a real APCOA penalty notice:
- Navy (`#0a1628`) header — "PARKING CHARGE NOTICE" + yellow plate
- Yellow/black hazard stripe (skewX diagonal)
- Large yellow charge amount on black background (`£X.XX`)
- Detail table: location, entry time, duration
- Deadline countdown (urgency colour)
- "PAY NOW →" + "✓ Mark Paid" buttons

---

## Backend API (Railway)

```
GET  /health                    → version, uptime
GET  /api/zones                 → full zone list
POST /api/dvla/lookup           → { plate } → vehicle info
GET  /api/ulez-check?plate=     → ULEZ compliance
POST /api/zone-entry            → { plate, zoneId }
POST /api/zone-exit             → { plate, zoneId, exitedAt }
POST /api/register-token        → { plate, token } → push token registration
```

**Env vars (Railway):**
- `DVLA_API_KEY` — DVLA Vehicle Enquiry API key

---

## Storage Keys (AsyncStorage)

| Key | Content |
|---|---|
| `nf_user` | { name, plate, make, colour, year } |
| `nf_charges` | Unpaid charge list |
| `nf_history` | Paid charge history (max 100) |
| `nf_pending_visit` | Drop-off awaiting confirmation (for popup) |
| `nf_gps_state` | `{ cooldownUntil, cczIsInside, cczChargedDate }` — 3 fields only |

---

## Build & Deploy

**Local device build (USB):**
```bash
cd ~/Desktop/NoFine
npx expo run:ios --configuration Release --device 00008110-000A0C800252401E
```

**App Store / TestFlight (via Xcode):**
```
Xcode → Any iOS Device (arm64) → Product → Archive
→ Distribute App → App Store Connect → Upload
```

**App Store / TestFlight (cloud build):**
```bash
eas build --platform ios --profile production --auto-submit
```

**Backend deploy:**
Railway auto-deploys on push to GitHub main.

---

## Tests

> ⚠️ No tests exist yet — no test files and no framework installed. Real-world testing first, unit tests after.

### Unit Tests (To Do)

**Framework:** Jest + `@testing-library/react-native`

#### `calculateAirportFee` — Fee calculation
| Scenario | Input | Expected |
|---|---|---|
| Heathrow flat fee | `heathrow_t2`, 5 min | £7 |
| Heathrow flat fee | `heathrow_t5`, 12 min | £7 |
| Stansted ≤15 min | `stansted`, 10 min | £10 |
| Stansted >15 min | `stansted`, 20 min | £28 |
| Luton ≤10 min | `luton`, 8 min | £7 |
| Luton >10 min | `luton`, 14 min | £11 (£7 + 4min) |
| Gatwick ≤10 min | `gatwick_north`, 7 min | £10 |
| Gatwick >10 min | `gatwick_south`, 15 min | £15 (£10 + 5min) |
| London City ≤5 min | `london_city`, 4 min | £8 |
| London City >5 min | `london_city`, 9 min | £12 (£8 + 4min) |

#### 3-Point GPS Flow — `handleLocation`
| Scenario | Steps | Expected |
|---|---|---|
| Normal drop-off | entry → mid (stop 3 min) → exit | `triggerDropoff` called |
| Too fast at mid | enter mid with speed > 2.78 m/s | resetState, no trigger |
| Too short at mid | stay in mid < 2 min | resetState, no trigger |
| Too long at mid | stay in mid > 30 min | resetState, no trigger |
| Mid without entry | enter mid without passing entry | no trigger |
| Speed is null | enter mid with speed=null | filter skipped, mid counted |
| Cooldown active | re-enter within 10 min of trigger | no trigger |

#### CCZ Daily Charge
| Scenario | State | Expected |
|---|---|---|
| First entry, active hours | Mon 10:00, not charged today | £15 charge + notification |
| Second entry same day | already charged today | nothing happens |
| Entry outside active hours | Mon 06:00 or 20:00 | nothing happens |
| Weekend Sunday | Sun 10:00 | nothing happens |

#### `captureDropoffPoint` — Data filtering
| Scenario | Expected |
|---|---|
| Drop-off 2–15 min | point saved |
| Drop-off < 2 min | not saved |
| Drop-off > 15 min | not saved |
| `lastKnownLocation` is null | not saved |

---

### Real-World Tests (Manual)

Checklist for airport testing:

- [ ] Does entering the entry zone produce a log? (`[DROPOFF] → Entry`)
- [ ] Does slowing down in the mid zone produce a log? (`[DROPOFF] → Mid`)
- [ ] Does leaving the mid zone send a notification?
- [ ] Does tapping "YES" show the charge on HomeScreen?
- [ ] Does tapping "NO" save nothing?
- [ ] Does tapping "YES" with the app closed work? (background action)
- [ ] Does the system detect again after the 10 min cooldown?
- [ ] Does passing at speed > 6 mph suppress the notification?

---

## Important Notes

- **GPS system migrated to 3-point model** (April 2026) — old polygon/`DETECTION_ZONES` system fully removed.
- `api.ts` contains no zone data — it re-exports from `zones.ts` (`TERMINAL_ZONES`, `TerminalZone`).
- `locationService.ts`, `gps.ts`, `gpsState.ts` deleted — old GPS system, `dropoffDetection.ts` is used instead.
- ULEZ detection is not active — compliance check only at onboarding.
- CCZ `cczChargedDate` is persisted in `nf_gps_state` — survives app restarts.
- Terminal states (entry/mid flags) are in-memory — reset on restart, this is intentional.
- Nightly 23:00 reminder (`scheduleMidnightReminder`) **removed** (April 2026) — was firing every night regardless of trips. Future plan: send reminder only if there are unpaid charges and the midnight deadline is approaching — `Storage.getCharges()` → `filter(c => !c.paid)` → schedule if not empty.
- Railway backend free plan ends April 2026 — will upgrade to Hobby $5/mo or migrate to Supabase+Vercel.
- Speed filter: `speed > 2.78 m/s` (6 mph) at mid point → not counted as drop-off, vehicle is passing through.
