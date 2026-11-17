// Demo data: used only when Supabase is not configured, or with ?demo=1 in the URL.
// It imitates a week of readings so the dashboard can be previewed without the device.

import type { Reading, Sweep } from "./types";
import { PANEL } from "./config";

const STEP_MS = 60_000;
const DAYS = 7;

let seed = 12345;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const noise = (a: number) => a * (rand() * 2 - 1);

function irradianceAt(t: number) {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 6 || h > 18) return 0;
  const clear = 1000 * Math.pow(Math.sin((Math.PI * (h - 6)) / 12), 1.2);
  const cloud = 0.85 + 0.15 * Math.sin(t / 2.3e6) * Math.sin(t / 7.1e5);
  return Math.max(0, clear * cloud + noise(10));
}

function soilingAt(t: number, now: number) {
  const daysAgo = (now - t) / 86_400_000;
  if (daysAgo < 1.6) return 1 - 0.01 * (1.6 - daysAgo);           // cleaned 1.6 days ago
  return 1 - 0.11 * ((DAYS - daysAgo) / (DAYS - 1.6));             // dust building up before that
}

function isShaded(t: number, now: number) {
  const d = new Date(t);
  const today = new Date(now).toDateString() === d.toDateString();
  const h = d.getHours() + d.getMinutes() / 60;
  return today && h >= 14 && h < 14.67;
}

function makeReading(id: number, t: number, now: number, device: string): Reading {
  const G = irradianceAt(t);
  const shaded = isShaded(t, now);
  let SI = soilingAt(t, now) + noise(0.004);
  if (shaded) SI *= 0.62;
  const T = 22 + 0.03 * G + noise(0.3);
  const I = Math.max(0, PANEL.iscStc * (G / 1000) * SI * 0.87 + noise(0.003));
  const V = Math.min(18.2, I * 10);
  let status = "healthy";
  if (G < 150) status = "low_light";
  else if (shaded) status = "shading";
  else if (SI < 0.8) status = "heavy_dust";
  else if (SI < 0.93) status = "dust";
  return {
    id, created_at: new Date(t).toISOString(), device_id: device,
    irradiance: +G.toFixed(1), ref_current: +(0.2 * G / 1000).toFixed(4),
    panel_voltage: +V.toFixed(3), panel_current: +I.toFixed(4), panel_power: +(V * I).toFixed(3),
    panel_temp: +T.toFixed(2), soiling_index: G < 150 ? null : +SI.toFixed(4),
    performance_ratio: G < 300 ? null : +(SI * 0.98 + noise(0.01)).toFixed(4), status,
  };
}

// Two sub-strings, each with a bypass diode (same model as the firmware simulator)
function ivPoints(G: number, T: number, dust: number, shadeSub1: number): [number, number][] {
  const subIsc = (sub: number) => PANEL.iscStc * (G / 1000) * dust * (sub === 1 ? shadeSub1 : 1);
  const subV = (I: number, isc: number) => {
    const voc = (PANEL.vocStc / 2) * (1 - 0.0033 * (T - 25)) + 0.6 * Math.log(Math.max(G, 10) / 1000);
    if (isc <= 0 || I >= isc) return -0.6;
    return Math.max(-0.6, voc + 0.6 * Math.log(1 - I / isc));
  };
  const iMax = Math.max(subIsc(0), subIsc(1));
  const pts: [number, number][] = [];
  for (let k = 0; k <= 160; k++) {
    const I = iMax * (1 - k / 160);
    const V = subV(I, subIsc(0)) + subV(I, subIsc(1));
    if (V < 0) continue;
    pts.push([+Math.max(0, V + noise(0.02)).toFixed(3), +Math.max(0, I + noise(0.002)).toFixed(4)]);
  }
  return pts.sort((a, b) => a[0] - b[0]);
}

function analyse(points: [number, number][]) {
  let voc = 0, isc = 0, pmax = 0, vmp = 0, imp = 0;
  for (const [v, i] of points) {
    voc = Math.max(voc, v); isc = Math.max(isc, i);
    if (v * i > pmax) { pmax = v * i; vmp = v; imp = i; }
  }
  return { voc, isc, pmax, vmp, imp, ff: voc && isc ? pmax / (voc * isc) : 0 };
}

let cache: { device: string; readings: Reading[]; sweeps: Sweep[] } | null = null;

function build(device: string) {
  if (cache && cache.device === device) return cache;
  seed = 12345;
  const now = Date.now();
  const start = Math.floor((now - DAYS * 86_400_000) / STEP_MS) * STEP_MS;
  const readings: Reading[] = [];
  const sweeps: Sweep[] = [];
  let id = 1, sid = 1;
  for (let t = start; t <= now - 20_000; t += STEP_MS) {
    const r = makeReading(id++, t, now, device);
    readings.push(r);
    if ((r.irradiance ?? 0) >= 300 && new Date(t).getMinutes() % 15 === 0) {
      const shaded = r.status === "shading";
      const dust = soilingAt(t, now);
      const pts = ivPoints(r.irradiance!, r.panel_temp!, dust, shaded ? 0.35 : 1);
      const a = analyse(pts);
      const pexp = PANEL.pmaxStc * (r.irradiance! / 1000) * (1 - 0.004 * (r.panel_temp! - 25));
      sweeps.push({
        id: sid++, created_at: r.created_at, device_id: device, irradiance: r.irradiance, panel_temp: r.panel_temp,
        voc: +a.voc.toFixed(3), isc: +a.isc.toFixed(4), pmax: +a.pmax.toFixed(3), vmp: a.vmp, imp: a.imp,
        fill_factor: +a.ff.toFixed(4), p_expected: +pexp.toFixed(3), performance_ratio: +(a.pmax / pexp).toFixed(4),
        peaks: shaded ? 2 : 1, status: r.status, points: pts,
      });
    }
  }
  cache = { device, readings, sweeps };
  return cache;
}

export const demo = {
  readingsSince(device: string, sinceMs: number) {
    return build(device).readings.filter((r) => Date.parse(r.created_at) >= sinceMs);
  },
  sweeps(device: string, limit: number) {
    return build(device).sweeps.slice(-limit).reverse().map(({ points, ...s }) => s);
  },
  sweepPoints(id: number) {
    return cache?.sweeps.find((s) => s.id === id)?.points ?? [];
  },
  // A new reading every 10 s so the "live" behaviour can be seen
  next(device: string): Reading {
    const c = build(device);
    const last = c.readings[c.readings.length - 1];
    const r = makeReading(last.id + 1, Date.now(), Date.now(), device);
    c.readings.push(r);
    return r;
  },
};
