"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Reading, Sweep } from "@/lib/types";
import { fetchSweepPoints } from "@/lib/data";
import { OFFLINE_AFTER_MS } from "@/lib/config";
import { OFFLINE, WAITING, statusInfo } from "@/lib/status";
import { faultEvents, fmt, fmtAgo, fmtTime, niceTicks } from "@/lib/format";
import { energyWh } from "@/lib/session";
import { StatusIcon } from "./Icons";

type Props = {
  latest: Reading | null;
  now: number;
  session: Reading[];          // readings of the latest session
  sessionStartMs: number | null;
  sweeps: Sweep[];             // newest first
};

export default function Hero({ latest, now, session, sessionStartMs, sweeps }: Props) {
  const online = !!latest && now - Date.parse(latest.created_at) < OFFLINE_AFTER_MS;
  const info = !latest ? WAITING : !online ? OFFLINE : statusInfo(latest.status);

  const energy = useMemo(() => energyWh(session), [session]);
  const events = useMemo(() => faultEvents(session).length, [session]);
  const sweepCount = sessionStartMs === null ? 0
    : sweeps.filter((s) => Date.parse(s.created_at) >= sessionStartMs).length;

  return (
    <section className="panel hero" aria-label="Panel status">
      <div className="hero-status" data-level={info.level}>
        <span className="badge"><StatusIcon level={info.level} size={16} />{info.label}</span>
        <h2 className="headline" aria-live="polite">{info.headline}</h2>
        <p className="advice">{info.advice}</p>

        <dl className="facts">
          <div><dt>Energy this session</dt><dd>{fmt(latest ? energy : null, 2)}<span className="unit">Wh</span></dd></div>
          <div><dt>Fault events</dt><dd>{latest ? events : "–"}</dd></div>
          <div><dt>I-V sweeps</dt><dd>{latest ? sweepCount : "–"}</dd></div>
        </dl>

        <div className="hero-foot">
          <span className={`chip live${online ? " is-live" : ""}`}>
            <span className="dot" aria-hidden="true" />{online ? "Device online" : "Device offline"}
          </span>
          {latest && <span className="muted">Last reading {fmtAgo(Date.parse(latest.created_at), now)}</span>}
        </div>
      </div>

      <PowerCurve sweep={sweeps[0] ?? null} />
    </section>
  );
}

function PowerCurve({ sweep }: { sweep: Sweep | null }) {
  const [points, setPoints] = useState<[number, number][] | null>(null);
  const gradId = `pv-fill-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!sweep) return;
    let cancelled = false;
    setPoints(null);
    fetchSweepPoints(sweep.id)
      .then((p) => { if (!cancelled) setPoints(p); })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [sweep?.id]);

  const data = useMemo(() => (points ?? []).map(([v, i]) => ({ v, p: v * i })), [points]);
  const xt = niceTicks(Math.max(0, ...data.map((d) => d.v)));
  const yt = niceTicks(Math.max(0, ...data.map((d) => d.p)) * 1.12);
  const peaks = sweep?.peaks ?? null;

  return (
    <div className="hero-curve">
      <div className="curve-head">
        <h3>Latest power curve</h3>
        {sweep && <span className="muted">I-V sweep at {fmtTime(Date.parse(sweep.created_at), true)}</span>}
      </div>

      {!sweep ? (
        <div className="empty">The power curve appears after the first I-V sweep.</div>
      ) : points === null ? (
        <div className="empty">Loading curve…</div>
      ) : data.length === 0 ? (
        <div className="empty">The power curve appears after the first I-V sweep.</div>
      ) : (
        <div className="curve-plot">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data} margin={{ top: 26, right: 18, bottom: 18, left: 4 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--cell)", stopOpacity: 0.28 }} />
                  <stop offset="100%" style={{ stopColor: "var(--cell)", stopOpacity: 0.02 }} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="v" type="number" domain={[0, xt[xt.length - 1]]} ticks={xt}
                tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false}
                tickFormatter={(v: number) => String(+v.toFixed(1))}
                label={{ value: "Voltage (V)", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11 }} />
              <YAxis width={46} domain={[0, yt[yt.length - 1]]} ticks={yt} tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false} tickLine={false} tickFormatter={(v: number) => String(+v.toFixed(1))}
                label={{ value: "Power (W)", angle: -90, position: "insideLeft", offset: 10, fill: "var(--muted)", fontSize: 11 }} />
              <Tooltip cursor={{ stroke: "var(--axis)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as { v: number; p: number };
                  return <div className="tooltip"><strong>{d.p.toFixed(2)} W</strong> at {d.v.toFixed(2)} V</div>;
                }} />
              <Area type="monotone" dataKey="p" stroke="var(--cell)" strokeWidth={2.2} fill={`url(#${gradId})`}
                activeDot={{ r: 4, stroke: "var(--glass)", strokeWidth: 2 }} isAnimationActive={false} />
              {sweep.vmp !== null && sweep.pmax !== null && (
                <ReferenceDot x={sweep.vmp} y={sweep.pmax} r={5.5} fill="var(--ink)" stroke="var(--glass)" strokeWidth={2.5}
                  label={{ value: `Maximum ${sweep.pmax.toFixed(1)} W`, position: "top", offset: 10,
                    fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {sweep && (
        <dl className="curve-stats">
          <div><dt>Open-circuit voltage</dt><dd>{fmt(sweep.voc, 1, "V")}</dd></div>
          <div><dt>Short-circuit current</dt><dd>{fmt(sweep.isc, 2, "A")}</dd></div>
          <div><dt>Fill factor</dt><dd>{fmt(sweep.fill_factor, 2)}</dd></div>
          <div className="peaks" data-shaded={peaks !== null && peaks >= 2 ? "" : undefined}>
            <strong>{peaks === null ? "Peaks not counted" : peaks >= 2
              ? `${peaks} power peaks: shading pattern` : "One power peak: normal shape"}</strong>
          </div>
        </dl>
      )}
    </div>
  );
}
