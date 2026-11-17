"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Reading, Sweep } from "@/lib/types";
import { fetchReadings, fetchSweeps, isDemo, subscribe } from "@/lib/data";
import { DEFAULT_DEVICE, OFFLINE_AFTER_MS, THRESHOLDS } from "@/lib/config";
import { faultEvents, readingsCsv, toSeries } from "@/lib/format";
import StatusHero from "./StatusHero";
import StatTiles from "./StatTiles";
import TrendChart from "./TrendChart";
import IVViewer from "./IVViewer";
import FaultLog from "./FaultLog";
import { DownloadIcon, SunIcon } from "./Icons";

const RANGES = [
  { key: "1h", label: "1 hour", ms: 3_600_000 },
  { key: "6h", label: "6 hours", ms: 6 * 3_600_000 },
  { key: "24h", label: "24 hours", ms: 24 * 3_600_000 },
  { key: "7d", label: "7 days", ms: 7 * 24 * 3_600_000 },
];

export default function Dashboard() {
  const [device, setDevice] = useState(DEFAULT_DEVICE);
  const [demo, setDemo] = useState(false);
  const [rangeKey, setRangeKey] = useState("24h");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [sweeps, setSweeps] = useState<Sweep[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const range = RANGES.find((r) => r.key === rangeKey)!;
  const start = now - range.ms;

  // ?device=other-id in the URL shows another device
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("device")) setDevice(q.get("device")!);
    setDemo(isDemo());
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, s] = await Promise.all([fetchReadings(device, Date.now() - range.ms), fetchSweeps(device, 40)]);
      setReadings(r);
      setSweeps(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [device, range.ms]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return subscribe(device, {
      onReading: (r) => setReadings((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r])),
      onSweep: (s) => setSweeps((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev].slice(0, 40))),
      onLive: setLive,
    });
  }, [device]);

  const inRange = useMemo(() => readings.filter((r) => Date.parse(r.created_at) >= start), [readings, start]);
  const latest = readings.length ? readings[readings.length - 1] : null;
  const online = !!latest && now - Date.parse(latest.created_at) < OFFLINE_AFTER_MS;
  const series = useMemo(() => toSeries(inRange, start, now), [inRange, start, now]);
  const events = useMemo(() => faultEvents(inRange), [inRange]);
  const withDate = range.ms > 24 * 3_600_000;

  function downloadCsv() {
    const blob = new Blob([readingsCsv(inRange)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${device}-readings-${range.key}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="brand-icon"><SunIcon /></span>
          <div>
            <h1>Solar PV Fault &amp; Dust Monitor</h1>
            <p className="muted">IEEE Mzuzu University Student Club · Renewable Energy Systems Engineering</p>
          </div>
        </div>
        <div className="top-meta">
          <span className="device">Device <strong>{device}</strong></span>
          <span className={`pill ${live ? "pill-on" : "pill-off"}`} title="Supabase Realtime connection">
            <span className="dot" />{live ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      {demo && (
        <div className="banner" role="note">
          <strong>Demo data.</strong> These numbers are generated for preview and do not come from your device.
          Add your Supabase URL and publishable key to <code>.env.local</code> to see real data.
        </div>
      )}
      {error && (
        <div className="banner banner-error" role="alert">
          <strong>Could not load data:</strong> {error}. Check the Supabase URL and key in <code>.env.local</code>.
        </div>
      )}

      <StatusHero latest={latest} online={online} now={now} />
      <StatTiles latest={latest} sweep={sweeps[0] ?? null} />

      <div className="toolbar">
        <h2>History</h2>
        <div className="toolbar-right">
          <div className="segmented" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.key} role="radio" aria-checked={r.key === rangeKey}
                className={r.key === rangeKey ? "on" : ""} onClick={() => setRangeKey(r.key)}>{r.label}</button>
            ))}
          </div>
          <button className="btn" onClick={downloadCsv} disabled={!inRange.length}>
            <DownloadIcon /> CSV
          </button>
        </div>
      </div>
      {loading && <p className="muted loading">Loading readings…</p>}

      <div className="charts">
        <TrendChart title="Irradiance" subtitle="Sunlight measured by the clean reference cell (W/m²)"
          field="irradiance" unit="W/m²" decimals={0} data={series} start={start} end={now} withDate={withDate}
          domain={[0, "auto"]} />
        <TrendChart title="Panel power" subtitle="Power delivered to the load (W)"
          field="panel_power" unit="W" decimals={2} data={series} start={start} end={now} withDate={withDate}
          domain={[0, "auto"]} />
        <TrendChart title="Soiling index" subtitle="1.00 = as clean as at calibration; lower = dustier"
          field="soiling_index" unit="" decimals={3} data={series} start={start} end={now} withDate={withDate}
          domain={[0.5, 1.1]} ticks={[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1]}
          thresholds={[{ y: THRESHOLDS.siDust, label: "dust 0.93" }, { y: THRESHOLDS.siHeavyDust, label: "heavy dust 0.80" }]} />
        <TrendChart title="Panel temperature" subtitle="Back-of-panel temperature from the DS18B20 (°C)"
          field="panel_temp" unit="°C" decimals={1} data={series} start={start} end={now} withDate={withDate}
          thresholds={[{ y: THRESHOLDS.tempHot, label: "hot spot 75 °C" }]} />
      </div>

      <IVViewer sweeps={sweeps} />
      <FaultLog events={events} now={now} rangeLabel={`last ${range.label}`} />

      <footer className="foot muted">
        Low-Cost Solar Panel Fault and Dust Detection System · ESP32 + INA219 + DS18B20 · Data stored in Supabase
      </footer>
    </div>
  );
}
