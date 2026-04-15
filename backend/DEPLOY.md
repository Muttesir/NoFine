# Driver Charges Backend — Deploy Guide

## Tam sistem nasıl çalışır

```
iPhone GPS → Heathrow zone algıla
         → Backend API'ye POST /api/zone-entry
         → Backend Puppeteer ile APCOA sayfasını açar
         → Plakayı yazar, Search'e basar
         → Entry: 19:47:25 / Exit: 19:49:13 / Fee: £7.00 döner
         → Flutter app gösterir
         → Driver Apple Pay ile öder
```

---

## Adım 1 — Backend'i deploy et (ücretsiz, 5 dakika)

### Railway (önerilir — ücretsiz $5 kredi)
```bash
# 1. railway.app'e git → GitHub ile login
# 2. "New Project" → "Deploy from GitHub"
# 3. Bu klasörü GitHub'a push et
# 4. Environment variables ekle (aşağıda)
# 5. URL alırsın: https://xxx.railway.app
```

### Render (alternatif — ücretsiz tier var)
```bash
# 1. render.com → New Web Service
# 2. GitHub repo bağla
# 3. Build command: npm install
# 4. Start command: npm start
```

---

## Adım 2 — Environment Variables

Railway / Render'da şunları ekle:

```env
# Stripe (dashboard.stripe.com → API Keys)
STRIPE_SECRET_KEY=sk_test_...        # test için
# STRIPE_SECRET_KEY=sk_live_...      # live için

# Firebase (console.firebase.google.com → Project Settings → Service Accounts)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@xxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

PORT=3000
```

---

## Adım 3 — Flutter app'e backend URL'i ekle

```dart
// lib/services/charge_api.dart içinde:
static const String _baseUrl = 'https://xxx.railway.app'; // buraya koy
```

---

## Adım 4 — Test et

### Manuel test:
```bash
# Zone entry simüle et
curl -X POST https://xxx.railway.app/api/zone-entry \
  -H "Content-Type: application/json" \
  -d '{"plate":"ND21OJO","zoneId":"luton","fcmToken":"test"}'

# Beklenen cevap:
{
  "hasCharge": true,
  "plate": "ND21OJO",
  "airportName": "Luton Airport",
  "entryTime": "Mon 23 March 19:47:25",
  "exitTime": "Mon 23 March 19:49:13",
  "durationMinutes": 1,
  "fee": 7.00,
  "penaltyFee": 95,
  "payByDeadline": "2026-03-23T23:59:59.000Z"
}
```

---

## Puppeteer notu

APCOA sitesi JavaScript render ediyor — bu yüzden `axios` değil `puppeteer` (headless Chrome) kullanıyoruz. Railway/Render bunu destekliyor. Eğer puppeteer yavaş olursa:

```bash
# Playwright kullanabilirsin (daha hızlı):
npm install playwright
npx playwright install chromium
```

---

## Heathrow notu

Heathrow'un sistemi APCOA değil — kendi sistemi var. Şu an:
- Flat £5 — süreye bakılmıyor
- Kendi drop-off sayfası var

Heathrow için ayrı anlaşma gerekiyor VEYA flat ücret olduğu için GPS'te sadece "girdin, £5 borçlusun" gösteriyoruz.

---

## Deployment sonrası akış

```
Driver araba kullanıyor
  ↓
Flutter GPS: Luton geofence'ine girdi
  ↓  
app_state.dart → onEntry(zone) çalışır
  ↓
ChargeApiService.checkCharge(plate, 'luton', fcmToken)
  ↓
POST https://xxx.railway.app/api/zone-entry
  ↓
Backend: Puppeteer → APCOA → entry/exit parse
  ↓
Firebase Push Notification → iPhone'a gelir
  ↓
App gösterir: "Entry 19:47 · Exit 19:49 · £7.00 · Pay Now"
  ↓
Driver Apple Pay'e basar → Stripe → £7 çekilir
  ↓
"✅ Paid — £95 penalty avoided!"
```
