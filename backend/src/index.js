'use strict';

const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ─── Persistent JSON store ────────────────────────────────────────────────────
// Survives process restarts within a deployment.
// For full persistence across redeploys, migrate to a hosted DB (e.g. Postgres).

const STORE_PATH = path.join(__dirname, '../data/store.json');

function ensureDataDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  try {
    ensureDataDir();
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[STORE] read error:', e.message);
  }
  return { pushTokens: {}, activeEntries: {} };
}

function writeStore(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[STORE] write error:', e.message);
  }
}

// ─── Zone definitions ─────────────────────────────────────────────────────────

const ZONES = [
  { id: 'heathrow_t2',   name: 'Heathrow Terminal 2',    shortName: 'Heathrow T2',    group: 'heathrow',    lat: 51.4713, lng: -0.4523, radiusKm: 0.25, chargeType: 'per_entry',   baseFee: 7.00,  penaltyFee: 80,  payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',                              deadlineHours: 24, note: '£7 per entry · max 10min' },
  { id: 'heathrow_t3',   name: 'Heathrow Terminal 3',    shortName: 'Heathrow T3',    group: 'heathrow',    lat: 51.4738, lng: -0.4564, radiusKm: 0.25, chargeType: 'per_entry',   baseFee: 7.00,  penaltyFee: 80,  payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',                              deadlineHours: 24, note: '£7 per entry · max 10min' },
  { id: 'heathrow_t4',   name: 'Heathrow Terminal 4',    shortName: 'Heathrow T4',    group: 'heathrow',    lat: 51.4584, lng: -0.4497, radiusKm: 0.25, chargeType: 'per_entry',   baseFee: 7.00,  penaltyFee: 80,  payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',                              deadlineHours: 24, note: '£7 per entry · max 10min' },
  { id: 'heathrow_t5',   name: 'Heathrow Terminal 5',    shortName: 'Heathrow T5',    group: 'heathrow',    lat: 51.4723, lng: -0.4880, radiusKm: 0.25, chargeType: 'per_entry',   baseFee: 7.00,  penaltyFee: 80,  payUrl: 'https://heathrowdropoff.apcoa.com/trip/vrn',                              deadlineHours: 24, note: '£7 per entry · max 10min' },
  { id: 'gatwick_north', name: 'Gatwick North Terminal', shortName: 'Gatwick North',  group: 'gatwick',     lat: 51.1618, lng: -0.1776, radiusKm: 0.30, chargeType: 'by_duration', baseFee: 10.00, baseMinutes: 10, extraPerMin: 1.00, maxMinutes: 30, penaltyFee: 100, payUrl: 'https://www.gatwickairport.com/transport-options/drop-off', deadlineHours: 24, note: '0-10min: £10 · +£1/min after' },
  { id: 'gatwick_south', name: 'Gatwick South Terminal', shortName: 'Gatwick South',  group: 'gatwick',     lat: 51.1508, lng: -0.1774, radiusKm: 0.30, chargeType: 'by_duration', baseFee: 10.00, baseMinutes: 10, extraPerMin: 1.00, maxMinutes: 30, penaltyFee: 100, payUrl: 'https://www.gatwickairport.com/transport-options/drop-off', deadlineHours: 24, note: '0-10min: £10 · +£1/min after' },
  { id: 'stansted',      name: 'Stansted Airport',       shortName: 'Stansted',       group: 'stansted',    lat: 51.8843, lng: 0.2628,  radiusKm: 0.40, chargeType: 'by_duration', baseFee: 10.00, over15Fee: 28.00, maxMinutes: 30, penaltyFee: 100, payUrl: 'https://pay.stanstedairport.com', deadlineHours: 24, note: '0-15min: £10 · 15-30min: £28' },
  { id: 'luton',         name: 'Luton Airport',          shortName: 'Luton',          group: 'luton',       lat: 51.8748, lng: -0.3683, radiusKm: 0.30, chargeType: 'by_duration', baseFee: 7.00,  baseMinutes: 10, extraPerMin: 1.00, maxMinutes: 30, penaltyFee: 95, payUrl: 'https://www.london-luton.co.uk/to-and-from-lla/dropping-off', deadlineHours: 24, note: '0-10min: £7 · +£1/min after' },
  { id: 'london_city',   name: 'London City Airport',    shortName: 'London City',    group: 'london_city', lat: 51.5048, lng: 0.0495,  radiusKm: 0.25, chargeType: 'by_duration', baseFee: 8.00,  baseMinutes: 5,  extraPerMin: 1.00, maxMinutes: 10, penaltyFee: 80, payUrl: 'https://www.londoncityairport.com/to-and-from-the-airport/drop-off', deadlineHours: 24, note: '0-5min: £8 · +£1/min after' },
  { id: 'ccz',           name: 'Congestion Charge Zone', shortName: 'CCZ',            group: 'ccz',         lat: 51.5155, lng: -0.1100, radiusKm: 2.80, chargeType: 'daily',       baseFee: 15.00, penaltyFee: 160, payUrl: 'https://tfl.gov.uk/modes/driving/congestion-charge',              deadlineHours: 24, note: '£15/day · Mon-Fri 07:00-18:00' },
  { id: 'ulez',          name: 'Ultra Low Emission Zone',shortName: 'ULEZ',           group: 'ulez',        lat: 51.5074, lng: -0.1278, radiusKm: 18.0, chargeType: 'daily',       baseFee: 12.50, penaltyFee: 180, payUrl: 'https://tfl.gov.uk/modes/driving/ultra-low-emission-zone',        deadlineHours: 24, note: '£12.50/day · 24/7' },
  { id: 'oxford_zez',    name: 'Oxford Zero Emission Zone', shortName: 'Oxford ZEZ', group: 'oxford',       lat: 51.7520, lng: -1.2577, radiusKm: 0.50, chargeType: 'daily',       baseFee: 4.00,  penaltyFee: 60,  payUrl: 'https://www.oxford.gov.uk/zez',                                   deadlineHours: 24, note: '£4-20/day · non-EV · 07:00-19:00' },
  { id: 'oxford_ccz',    name: 'Oxford Congestion Zone', shortName: 'Oxford CCZ',     group: 'oxford',      lat: 51.7540, lng: -1.2550, radiusKm: 1.20, chargeType: 'daily',       baseFee: 5.00,  penaltyFee: 60,  payUrl: 'https://www.oxford.gov.uk/ccz',                                   deadlineHours: 24, note: '£5/day · 07:00-19:00' },
];

// ─── Fee calculation ──────────────────────────────────────────────────────────

function calculateFee(zone, durationMinutes) {
  if (zone.chargeType === 'per_entry' || zone.chargeType === 'daily') return zone.baseFee;
  if (zone.id === 'stansted')                                  return durationMinutes <= 15 ? 10.00 : 28.00;
  if (zone.id === 'luton')                                     return durationMinutes <= 10 ? 7.00  : 7.00  + Math.ceil(durationMinutes - 10);
  if (zone.id === 'london_city')                               return durationMinutes <= 5  ? 8.00  : 8.00  + Math.ceil(durationMinutes - 5);
  if (zone.id === 'gatwick_north' || zone.id === 'gatwick_south') return durationMinutes <= 10 ? 10.00 : 10.00 + Math.ceil(durationMinutes - 10);
  return zone.baseFee;
}

/** Payment deadline = midnight at the end of tomorrow. */
function getDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.3.0', time: new Date().toISOString() });
});

app.get('/api/zones', (_req, res) => {
  res.json({ zones: ZONES });
});

app.post('/api/register-token', (req, res) => {
  const { plate, token } = req.body;
  if (!plate || !token) return res.status(400).json({ error: 'plate and token required' });

  const store = readStore();
  store.pushTokens[plate.toUpperCase()] = token;
  writeStore(store);

  console.log(`[TOKEN] Registered for ${plate.toUpperCase()}`);
  res.json({ success: true });
});

app.post('/api/dvla/lookup', async (req, res) => {
  const { plate } = req.body;
  if (!plate) return res.status(400).json({ error: 'plate required' });

  const clean = plate.replace(/\s+/g, '').toUpperCase();

  if (!process.env.DVLA_API_KEY) {
    console.warn('[DVLA] DVLA_API_KEY not set — returning unverified result');
    return res.json({ plate: clean, make: 'UNKNOWN', colour: 'UNKNOWN', year: null, verified: false });
  }

  try {
    const response = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method: 'POST',
      headers: { 'x-api-key': process.env.DVLA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber: clean }),
    });
    if (response.ok) {
      const data = await response.json();
      return res.json({
        plate: clean,
        make: data.make || 'UNKNOWN',
        colour: data.colour || 'UNKNOWN',
        year: data.yearOfManufacture || null,
        fuelType: data.fuelType || '',
        verified: true,
      });
    }
    console.warn('[DVLA] API returned', response.status);
  } catch (e) {
    console.error('[DVLA] lookup error:', e.message);
  }

  return res.json({ plate: clean, make: 'UNKNOWN', colour: 'UNKNOWN', year: null, verified: false });
});

app.post('/api/zone-entry', (req, res) => {
  const { plate, zoneId, enteredAt } = req.body;
  if (!plate || !zoneId) return res.status(400).json({ error: 'plate and zoneId required' });

  const zone = ZONES.find(z => z.id === zoneId);
  if (!zone) return res.status(404).json({ error: 'zone not found' });

  const key       = `${plate.toUpperCase()}:${zoneId}`;
  const entryTime = enteredAt ? new Date(enteredAt) : new Date();

  const store = readStore();
  store.activeEntries[key] = entryTime.toISOString();
  writeStore(store);

  console.log(`[ENTRY] ${plate.toUpperCase()} → ${zone.shortName} at ${entryTime.toISOString()}`);
  res.json({
    plate: plate.toUpperCase(),
    zoneId,
    zoneName: zone.name,
    shortName: zone.shortName,
    enteredAt: entryTime.toISOString(),
    estimatedFee: zone.baseFee,
    deadline: getDeadline().toISOString(),
    payUrl: zone.payUrl,
    note: zone.note,
    penaltyFee: zone.penaltyFee,
  });
});

app.post('/api/zone-exit', (req, res) => {
  const { plate, zoneId, exitedAt } = req.body;
  if (!plate || !zoneId) return res.status(400).json({ error: 'plate and zoneId required' });

  const zone = ZONES.find(z => z.id === zoneId);
  if (!zone) return res.status(404).json({ error: 'zone not found' });

  const key  = `${plate.toUpperCase()}:${zoneId}`;
  const store = readStore();

  const entryTime  = store.activeEntries[key] ? new Date(store.activeEntries[key]) : new Date();
  const exitTime   = exitedAt ? new Date(exitedAt) : new Date();
  const durationMin = Math.max(1, Math.round((exitTime - entryTime) / 60_000));
  const fee        = calculateFee(zone, durationMin);

  delete store.activeEntries[key];
  writeStore(store);

  console.log(`[EXIT] ${plate.toUpperCase()} ← ${zone.shortName} · ${durationMin}min · £${fee}`);
  res.json({
    plate: plate.toUpperCase(),
    zoneId,
    zoneName: zone.name,
    shortName: zone.shortName,
    enteredAt: entryTime.toISOString(),
    exitedAt: exitTime.toISOString(),
    durationMinutes: durationMin,
    fee,
    deadline: getDeadline().toISOString(),
    payUrl: zone.payUrl,
    penaltyFee: zone.penaltyFee,
    note: zone.note,
  });
});

app.get('/api/ulez-check', async (req, res) => {
  const { plate } = req.query;
  if (!plate) return res.status(400).json({ error: 'plate required' });

  if (!process.env.DVLA_API_KEY) {
    console.warn('[ULEZ] DVLA_API_KEY not set — cannot perform ULEZ check');
    return res.status(503).json({ error: 'ULEZ check unavailable: DVLA_API_KEY not configured' });
  }

  try {
    const r = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method: 'POST',
      headers: { 'x-api-key': process.env.DVLA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber: String(plate).replace(/\s+/g, '').toUpperCase() }),
    });
    const data  = await r.json();
    const year  = data.yearOfManufacture || 0;
    const fuel  = (data.fuelType || '').toUpperCase();
    let compliant = false;
    if (fuel.includes('ELECTRIC'))                          compliant = true;
    else if (fuel.includes('PETROL') || fuel.includes('HYBRID')) compliant = year >= 2006;
    else if (fuel.includes('DIESEL'))                       compliant = year >= 2015;

    res.json({
      plate: String(plate).toUpperCase(),
      year,
      fuelType: fuel,
      ulezCompliant: compliant,
      charge: compliant ? 0 : 12.5,
    });
  } catch (e) {
    console.error('[ULEZ] lookup error:', e.message);
    res.status(500).json({ error: 'ULEZ lookup failed' });
  }
});

app.listen(PORT, () => console.log(`NoFine API v2.3 running on port ${PORT}`));
