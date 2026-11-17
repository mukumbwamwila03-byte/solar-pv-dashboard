// Virtual ESP32: uploads simulated readings and I-V sweeps to Supabase so the dashboard
// can be tested without hardware (same panel model as the firmware's SIMULATE_SENSORS mode).
//
//   npm run simulate              upload to Supabase (settings from .env.local)
//   npm run simulate -- --dry     print what would be sent, upload nothing
//
// While it runs, press 1-8 to inject a fault (like the firmware's Serial Monitor):
//   1 normal  2 dust  3 heavy dust  4 shading  5 diode fault  6 open circuit  7 low light  8 hot spot
//   s = I-V sweep now    q = quit

import { readFileSync, existsSync } from "node:fs";

// ---------- settings ----------
const env = {};
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? env.NEXT_PUBLIC_SUPABASE_KEY ?? "";
const DEVICE = process.env.NEXT_PUBLIC_DEVICE_ID ?? env.NEXT_PUBLIC_DEVICE_ID ?? "mzuni-pv-01";
const DRY = process.argv.includes("--dry");
const READ_EVERY_MS = 10_000;        // one reading every 10 s
const SWEEP_EVERY_MS = 2 * 60_000;   // one I-V sweep every 2 min (and on every fault change)

if (!DRY && (!URL_ || !KEY)) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_KEY in .env.local");
  process.exit(1);
}
if (KEY.startsWith("sb_secret_")) {
  console.error("Use the PUBLISHABLE key (sb_publishable_...), never the secret key.");
  process.exit(1);
}

// ---------- panel model (copied from the firmware) ----------
const PANEL = { pmax: 20.0, voc: 21.6, isc: 1.22, gammaP: -0.004, betaVoc: -0.0033 };
const REF_ISC = 0.2, LOAD_OHMS = 10, VT_SUB = 0.6;
const NAMES = ["", "normal", "dust", "heavy dust", "shading", "diode fault", "open circuit", "low light", "hot spot"];
let mode = 1;
const noise = (a) => a * (Math.random() * 2 - 1);

const irradiance = (t) => (mode === 7 ? 90 + noise(5) : 850 + 40 * Math.sin(t / 120000) + noise(8));
function subIsc(sub, G, T) {
  let isc = PANEL.isc * (G / 1000) * (1 + 0.0005 * (T - 25));
  if (mode === 2) isc *= 0.88;
  if (mode === 3) isc *= 0.72;
  if (mode === 4 && sub === 1) isc *= 0.35;
  return isc;
}
function subV(I, isc, G, T) {
  const voc = (PANEL.voc / 2) * (1 + PANEL.betaVoc * (T - 25)) + VT_SUB * Math.log(Math.max(G, 10) / 1000);
  if (isc <= 0 || I >= isc) return -0.6;              // bypass diode conducts
  return Math.max(-0.6, voc + VT_SUB * Math.log(1 - I / isc));
}
function panelV(I, G, T) {
  if (mode === 6) return 0;
  let v = subV(I, subIsc(0, G, T), G, T);
  if (mode !== 5) v += subV(I, subIsc(1, G, T), G, T); // mode 5: one sub-string lost
  return v;
}
// Current at a given voltage (V falls as I rises, so bisection works)
function currentAt(V, G, T) {
  let lo = 0, hi = Math.max(subIsc(0, G, T), subIsc(1, G, T));
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (panelV(mid, G, T) > V) lo = mid; else hi = mid;
  }
  return lo;
}

// ---------- calibration and state ----------
let baseRatio = 0;
let lastSweep = null;
let lastSweepAt = 0;

function measure() {
  const t = Date.now();
  const G = irradiance(t);
  const T = 25 + 0.03 * G + noise(0.3) + (mode === 8 ? 45 : 0);
  const refI = (REF_ISC * G) / 1000;
  let I = 0, V = 0;
  if (mode !== 6) {
    let lo = 0, hi = Math.max(subIsc(0, G, T), subIsc(1, G, T));   // operating point on the load: V(I) = I x R
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (panelV(mid, G, T) - mid * LOAD_OHMS > 0) lo = mid; else hi = mid;
    }
    I = Math.max(0, lo + noise(0.002));
    V = Math.max(0, I * LOAD_OHMS + noise(0.01));
  }
  const SI = baseRatio > 0 && refI > 0.002 ? I / refI / baseRatio : null;
  return { G, T, refI, V, I, P: V * I, SI };
}

function sweep(r) {
  const vocEst = panelV(0, r.G, r.T);
  const points = [];
  if (vocEst > 0) {
    const N = 120;
    for (let k = 0; k <= N; k++) {
      const V = (vocEst * k) / N;
      const I = k === N ? 0 : currentAt(V, r.G, r.T);
      points.push([+Math.max(0, V + noise(0.02)).toFixed(3), +Math.max(0, I + noise(0.002)).toFixed(4)]);
    }
  }
  points.sort((a, b) => a[0] - b[0]);
  let voc = 0, isc = 0, pmax = 0, vmp = 0, imp = 0;
  for (const [v, i] of points) {
    voc = Math.max(voc, v); isc = Math.max(isc, i);
    if (v * i > pmax) { pmax = v * i; vmp = v; imp = i; }
  }
  const pexp = PANEL.pmax * (r.G / 1000) * (1 + PANEL.gammaP * (r.T - 25));
  return {
    points, voc, isc, pmax, vmp, imp,
    ff: voc > 0 && isc > 0 ? pmax / (voc * isc) : 0,
    pexp, pr: pexp > 0 ? pmax / pexp : null, peaks: countPeaks(points), G: r.G, T: r.T,
  };
}

// Same hump counting as the firmware: 1 = normal, 2+ = shading
function countPeaks(pts) {
  const n = pts.length;
  if (n < 9) return n ? 1 : 0;
  const ps = pts.map((_, k) => {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    let s = 0;
    for (let j = a; j <= b; j++) s += pts[j][0] * pts[j][1];
    return s / (b - a + 1);
  });
  const pmax = Math.max(...ps);
  if (pmax <= 0) return 0;
  let peaks = 0, lastPeak = 0, valley = 0;
  for (let k = 3; k < n - 3; k++) {
    if (peaks > 0) valley = Math.min(valley, ps[k]);
    let isMax = true;
    for (let j = 1; j <= 3; j++) if (ps[k] < ps[k - j] || ps[k] <= ps[k + j]) { isMax = false; break; }
    if (!isMax || ps[k] < 0.2 * pmax) continue;
    if (peaks === 0 || valley < 0.9 * Math.min(lastPeak, ps[k])) { peaks++; lastPeak = ps[k]; }
    else lastPeak = Math.max(lastPeak, ps[k]);
    valley = ps[k];
  }
  return Math.max(peaks, 1);
}

function classify(r) {
  if (r.G < 150) return "low_light";
  const expectedI = baseRatio > 0 ? baseRatio * r.refI : (PANEL.isc * r.G) / 1000;
  if (r.G > 300 && r.I < 0.05 * expectedI) return "open_circuit";
  if (r.T > 75) return "hot_spot";
  if (lastSweep && Date.now() - lastSweepAt < 20 * 60_000) {
    const expVoc = PANEL.voc * (1 + PANEL.betaVoc * (lastSweep.T - 25));
    if (lastSweep.voc < 0.8 * expVoc) return "diode_fault";
    if (lastSweep.peaks >= 2) return "shading";
  }
  if (baseRatio <= 0) return "not_calibrated";
  if (r.SI !== null && r.SI < 0.8) return "heavy_dust";
  if (r.SI !== null && r.SI < 0.93) return "dust";
  return "healthy";
}

// ---------- upload ----------
const round = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? null : +v.toFixed(d));

async function post(table, body) {
  if (DRY) {
    const { points, ...rest } = body;
    console.log(`[dry] ${table}:`, JSON.stringify(rest), points ? `(+${points.length} points)` : "");
    return true;
  }
  try {
    const res = await fetch(`${URL_}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal",
        ...(KEY.startsWith("sb_") ? {} : { Authorization: `Bearer ${KEY}` }) },
      body: JSON.stringify(body),
    });
    if (res.ok) return true;
    console.log(`Upload to ${table} failed: HTTP ${res.status} ${await res.text()}`);
  } catch (e) {
    console.log(`Upload to ${table} failed: ${e.message}`);
  }
  return false;
}

let status = "boot";

async function doSweep(reason) {
  const r = measure();
  if (r.G < 300 || mode === 6) return;                 // firmware skips sweeps in low light / open circuit
  lastSweep = sweep(r);
  lastSweepAt = Date.now();
  status = classify(r);
  const s = lastSweep;
  const ok = await post("iv_sweeps", {
    device_id: DEVICE, irradiance: round(s.G, 1), panel_temp: round(s.T, 2), voc: round(s.voc, 3), isc: round(s.isc, 4),
    pmax: round(s.pmax, 3), vmp: round(s.vmp, 3), imp: round(s.imp, 4), fill_factor: round(s.ff, 4),
    p_expected: round(s.pexp, 3), performance_ratio: round(s.pr, 4), peaks: s.peaks, status, points: s.points,
  });
  if (ok) console.log(`I-V sweep uploaded (${reason}): Voc ${s.voc.toFixed(2)} V, Pmax ${s.pmax.toFixed(2)} W, peaks ${s.peaks}`);
}

async function doReading() {
  const r = measure();
  const next = classify(r);
  if (next !== status) console.log(`>> STATUS: ${status} -> ${next}`);
  status = next;
  const fresh = lastSweep && Date.now() - lastSweepAt < 20 * 60_000;
  const ok = await post("readings", {
    device_id: DEVICE, irradiance: round(r.G, 1), ref_current: round(r.refI, 4), panel_voltage: round(r.V, 3),
    panel_current: round(r.I, 4), panel_power: round(r.P, 3), panel_temp: round(r.T, 2), soiling_index: round(r.SI, 4),
    performance_ratio: fresh ? round(lastSweep.pr, 4) : null, status,
  });
  if (ok) console.log(`Reading uploaded: G ${r.G.toFixed(0)} W/m2 | P ${r.P.toFixed(2)} W | SI ${r.SI?.toFixed(3) ?? "-"} | ${status}`);
}

// ---------- start ----------
console.log(`Virtual device "${DEVICE}" -> ${DRY ? "DRY RUN (nothing uploaded)" : URL_}`);
console.log("Keys: 1 normal  2 dust  3 heavy dust  4 shading  5 diode fault  6 open circuit  7 low light  8 hot spot  s sweep  q quit\n");

// Calibrate on a clean panel, like the firmware does at start-up in simulation mode
{
  let sum = 0;
  for (let k = 0; k < 20; k++) { const r = measure(); sum += r.I / r.refI; }
  baseRatio = sum / 20;
  console.log(`Calibrated: baseline ratio ${baseRatio.toFixed(4)}`);
}

await doSweep("start-up");
await doReading();
setInterval(doReading, READ_EVERY_MS);
setInterval(() => doSweep("scheduled"), SWEEP_EVERY_MS);

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (key) => {
    if (key === "q" || key === "\u0003") { console.log("Stopped."); process.exit(0); }
    if (key === "s") { await doSweep("manual"); return; }
    const n = Number(key);
    if (n >= 1 && n <= 8) {
      mode = n;
      console.log(`Simulation mode: ${NAMES[mode]}`);
      await doSweep("fault change");
      await doReading();
    }
  });
}
