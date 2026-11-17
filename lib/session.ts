// Helpers for the "latest session": the most recent run of readings without a long gap.

import type { Reading } from "./types";

const t = (r: Reading) => Date.parse(r.created_at);

// Start time of the most recent run of readings with no gap longer than gapMs
export function sessionStart(readings: Reading[], gapMs = 30 * 60_000): number | null {
  if (!readings.length) return null;
  let k = readings.length - 1;
  while (k > 0 && t(readings[k]) - t(readings[k - 1]) <= gapMs) k--;
  return t(readings[k]);
}

// Energy delivered to the load: sum of P x dt, skipping gaps longer than maxGapMs (device off)
export function energyWh(readings: Reading[], maxGapMs = 10 * 60_000): number {
  let wh = 0;
  for (let k = 1; k < readings.length; k++) {
    const dt = t(readings[k]) - t(readings[k - 1]);
    const p = readings[k - 1].panel_power;
    if (dt <= 0 || dt > maxGapMs || p === null || p === undefined) continue;
    wh += (p * dt) / 3_600_000;
  }
  return wh;
}

// Median time between readings (ms), used to decide what counts as a gap
export function medianInterval(readings: Reading[], fallback = 60_000): number {
  if (readings.length < 2) return fallback;
  const dts = readings.slice(1).map((r, k) => t(r) - t(readings[k])).filter((d) => d > 0).sort((a, b) => a - b);
  return dts.length ? dts[Math.floor(dts.length / 2)] : fallback;
}
