"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Reading, Sweep } from "@/lib/types";
import { fetchReadings, fetchSweeps, isDemo, subscribe } from "@/lib/data";
import { DEFAULT_DEVICE, THRESHOLDS } from "@/lib/config";
import { faultEvents, readingsCsv, toSeries } from "@/lib/format";
import { sessionStart } from "@/lib/session";
import Header from "./Header";
import Hero from "./Hero";
import Readouts from "./Readouts";
import StatusTimeline from "./StatusTimeline";
import TrendChart from "./TrendChart";
import IVViewer from "./IVViewer";
import FaultLog from "./FaultLog";
import { DownloadIcon } from "./Icons";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SESSION_GAP = 30 * 60_000;   // a gap longer than this starts a new session
const MIN_WINDOW = 15 * 60_000;
const PAD = 0.04;

const RANGES = [
  { key: "session", label: "Latest session", ms: 0, phrase: "latest session" },
  { key: "1h", label: "1 hour", ms: HOUR, phrase: "last hour" },
  { key: "6h", label: "6 hours", ms: 6 * HOUR, phrase: "last 6 hours" },
  { key: "24h", label: "24 hours", ms: DAY, phrase: "last 24 hours" },
  { key: "7d", label: "7 days", ms: 7 * DAY, phrase: "last 7 days" },
];

export default function Dashboard({ footer }: { footer?: ReactNode }) {
  const [device, setDevice] = useState(DEFAULT_DEVICE);
  const [demo, setDemo] = useState(false);
  const [rangeKey, setRangeKey] = useState("session");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [sweeps, setSweeps] = useState<Sweep[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const range = RANGES.find((r) => r.key === rangeKey)!;
  // Always load at least 24 h so the latest session and the hero facts are complete
  const loadMs = Math.max(range.ms, DAY);

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
      const [r, s] = await Promise.all([fetchReadings(device, Date.now() - loadMs), fetchSweeps(device, 40)]);
      setReadings(r);
      setSweeps(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [device, loadMs]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return subscribe(device, {
      onReading: (r) => setReadings((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r])),
      onSweep: (s) => setSweeps((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev].slice(0, 40))),
      onLive: setLive,
    });
  }, [device]);

  const latest = readings.length ? readings[readings.length - 1] : null;
  const sStart = useMemo(() => sessionStart(readings, SESSION_GAP), [readings]);
  const session = useMemo(
    () => (sStart === null ? [] : readings.filter((r) => Date.parse(r.created_at) >= sStart)),
    [readings, sStart],
  );

  // Chart window. "Latest session" starts where the most recent run of readings begins,
  // so the charts fill the width instead of showing a few dots at the right edge.
  let start: number, end: number;
  if (range.key === "session") {
    const lastT = latest ? Date.parse(latest.created_at) : now;
    const ongoing = now - lastT < SESSION_GAP;
    const e0 = ongoing ? now : lastT;
    const s0 = Math.min(sStart ?? e0 - HOUR, e0 - MIN_WINDOW);
    const pad = (e0 - s0) * PAD;
    start = s0 - pad;
    end = ongoing ? now : e0 + pad;
  } else {
    start = now - range.ms;
    end = now;
  }
  const inRange = useMemo(
    () => (range.key === "session" ? session : readings.filter((r) => Date.parse(r.created_at) >= start)),
    [range.key, session, readings, start],
  );
  const recent = useMemo(() => readings.filter((r) => Date.parse(r.created_at) >= now - HOUR), [readings, now]);
  const series = useMemo(() => toSeries(inRange, start, end), [inRange, start, end]);
  const events = useMemo(() => faultEvents(inRange), [inRange]);
  const withDate = end - start > DAY;
  const countText = `${inRange.length.toLocaleString()} reading${inRange.length === 1 ? "" : "s"} in the ${range.phrase}.`;

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
      <Header device={device} live={live} />

      {demo && (
        <div className="banner" role="note">
          <strong>Demo data.</strong> These numbers are generated for preview and do not come from your device.
          Remove <code>?demo=1</code> from the address, or add your Supabase settings to <code>.env.local</code>, to see real data.
        </div>
      )}
      {error && (
        <div className="banner banner-error" role="alert">
          <strong>Could not load data:</strong> {error}. Check the Supabase URL and key in <code>.env.local</code>.
        </div>
      )}

      <Hero latest={latest} now={now} session={session} sessionStartMs={sStart} sweeps={sweeps} />
      <Readouts latest={latest} recent={recent} sweeps={sweeps} />

      <div className="toolbar">
        <div className="section-title">
          <h2>History</h2>
          <p className="muted">{loading ? "Loading readings…" : countText}</p>
        </div>
        <div className="toolbar-right">
          <div className="segmented" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={r.key === rangeKey}
                className={r.key === rangeKey ? "on" : ""} onClick={() => setRangeKey(r.key)}>{r.label}</button>
            ))}
          </div>
          <button type="button" className="btn" onClick={downloadCsv} disabled={!inRange.length}>
            <DownloadIcon /> Download CSV
          </button>
        </div>
      </div>

      <StatusTimeline readings={inRange} start={start} end={end} withDate={withDate} />

      <div className="charts">
        <TrendChart title="Irradiance" subtitle="Sunlight measured by the clean reference cell, W/m²"
          field="irradiance" unit="W/m²" decimals={0} data={series} start={start} end={end} withDate={withDate}
          color="var(--sun)" domain={[0, "auto"]} />
        <TrendChart title="Panel power" subtitle="Power delivered to the load, W"
          field="panel_power" unit="W" decimals={2} data={series} start={start} end={end} withDate={withDate}
          domain={[0, "auto"]} />
        <TrendChart title="Soiling index" subtitle="1.00 is as clean as at calibration; lower is dustier"
          field="soiling_index" unit="" decimals={3} data={series} start={start} end={end} withDate={withDate}
          domain={[0.5, 1.1]} ticks={[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1]}
          thresholds={[{ y: THRESHOLDS.siDust, label: "dust 0.93" }, { y: THRESHOLDS.siHeavyDust, label: "heavy dust 0.80" }]} />
        <TrendChart title="Panel temperature" subtitle="Back-of-panel temperature from the DS18B20, °C"
          field="panel_temp" unit="°C" decimals={1} data={series} start={start} end={end} withDate={withDate}
          thresholds={[{ y: THRESHOLDS.tempHot, label: "hot spot 75 °C" }]} />
      </div>

      <IVViewer sweeps={sweeps} />
      <FaultLog events={events} now={now} rangeLabel={range.phrase} />

      {footer}

      <footer className="foot">
        Low-cost solar panel fault and dust detection system, built on an ESP32 with INA219 and DS18B20 sensors.
        Data is stored in Supabase.
      </footer>
    </div>
  );
}
