import type { Reading } from "./types";
import { isFault, statusInfo } from "./status";

export function fmt(v: number | null | undefined, dec: number, unit = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return `${v.toFixed(dec)}${unit ? " " + unit : ""}`;
}

export function fmtTime(ms: number, withDate = false): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (!withDate) return time;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

export function fmtAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export type Point = { t: number } & Record<string, number | null>;

const FIELDS = ["irradiance", "panel_power", "panel_voltage", "panel_current", "panel_temp", "soiling_index"] as const;

// Turns readings into chart points. Long ranges are averaged into ~400 buckets so the
// browser stays fast; gaps (device off) become breaks in the line instead of straight joins.
export function toSeries(readings: Reading[], start: number, end: number): Point[] {
  const rows = readings.map((r) => ({ ...r, t: Date.parse(r.created_at) }));
  if (rows.length <= 500) {
    const dts = rows.slice(1).map((r, k) => r.t - rows[k].t).sort((a, b) => a - b);
    const median = dts.length ? dts[Math.floor(dts.length / 2)] : 60_000;
    const gap = Math.max(5 * median, 120_000);
    const out: Point[] = [];
    rows.forEach((r, k) => {
      if (k > 0 && r.t - rows[k - 1].t > gap) out.push(nullPoint(rows[k - 1].t + 1));
      const p: Point = { t: r.t };
      for (const f of FIELDS) p[f] = r[f];
      out.push(p);
    });
    return out;
  }
  const N = 400;
  const width = (end - start) / N;
  const sums = Array.from({ length: N }, () => ({ n: 0, v: {} as Record<string, { s: number; n: number }> }));
  for (const r of rows) {
    const b = Math.min(N - 1, Math.max(0, Math.floor((r.t - start) / width)));
    sums[b].n++;
    for (const f of FIELDS) {
      const v = r[f];
      if (v === null || v === undefined) continue;
      const acc = (sums[b].v[f] ??= { s: 0, n: 0 });
      acc.s += v; acc.n++;
    }
  }
  const first = sums.findIndex((s) => s.n > 0);
  let last = -1;
  sums.forEach((s, k) => { if (s.n > 0) last = k; });
  const out: Point[] = [];
  for (let k = first; k >= 0 && k <= last; k++) {
    const p: Point = { t: start + (k + 0.5) * width };
    for (const f of FIELDS) {
      const a = sums[k].v[f];
      p[f] = a ? a.s / a.n : null;
    }
    out.push(p);
  }
  return out;
}

function nullPoint(t: number): Point {
  const p: Point = { t };
  for (const f of FIELDS) p[f] = null;
  return p;
}

export type FaultEvent = { status: string; start: number; end: number | null };

// Groups consecutive readings with the same fault status into one event
export function faultEvents(readings: Reading[]): FaultEvent[] {
  const events: FaultEvent[] = [];
  let cur: FaultEvent | null = null;
  for (const r of readings) {
    const t = Date.parse(r.created_at);
    if (cur && cur.status !== r.status) { cur.end = t; cur = null; }
    if (!cur && isFault(r.status)) { cur = { status: r.status, start: t, end: null }; events.push(cur); }
  }
  return events.reverse();
}

export function readingsCsv(readings: Reading[]): string {
  const cols = ["created_at", "irradiance", "ref_current", "panel_voltage", "panel_current", "panel_power",
    "panel_temp", "soiling_index", "performance_ratio", "status"] as const;
  const lines = [cols.join(",")];
  for (const r of readings) lines.push(cols.map((c) => r[c] ?? "").join(","));
  return lines.join("\n");
}

export function statusLabel(code: string) {
  return statusInfo(code).label;
}

// Round axis ticks (0, 0.1, 0.2 ... instead of 0, 0.19, 0.38)
export function niceTicks(max: number, count = 5): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}
