"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Sweep } from "@/lib/types";
import { fetchSweepPoints } from "@/lib/data";
import { statusInfo } from "@/lib/status";
import { fmt, fmtTime, niceTicks } from "@/lib/format";
import { StatusIcon } from "./Icons";

type Props = { sweeps: Sweep[] };

export default function IVViewer({ sweeps }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [error, setError] = useState("");

  const sweep = sweeps.find((s) => s.id === selected) ?? sweeps[0] ?? null;

  useEffect(() => {
    if (!sweep) return;
    let cancelled = false;
    setError("");
    fetchSweepPoints(sweep.id)
      .then((p) => { if (!cancelled) setPoints(p); })
      .catch((e) => { if (!cancelled) setError(String(e.message ?? e)); });
    return () => { cancelled = true; };
  }, [sweep?.id]);

  const data = useMemo(() => points.map(([v, i]) => ({ v, i, p: v * i })), [points]);

  if (!sweep) {
    return (
      <section className="panel iv">
        <h3>I-V curve tracer</h3>
        <div className="empty">No I-V sweeps yet. Press the button on the device or send s in the Serial Monitor.</div>
      </section>
    );
  }

  const info = statusInfo(sweep.status);
  const stats = [
    ["Voc", fmt(sweep.voc, 2, "V")], ["Isc", fmt(sweep.isc, 3, "A")], ["Pmax", fmt(sweep.pmax, 2, "W")],
    ["Vmp", fmt(sweep.vmp, 2, "V")], ["Imp", fmt(sweep.imp, 3, "A")], ["Fill factor", fmt(sweep.fill_factor, 2)],
    ["P expected", fmt(sweep.p_expected, 2, "W")], ["PR", fmt(sweep.performance_ratio, 2)],
    ["P-V peaks", sweep.peaks === null ? "–" : String(sweep.peaks)],
    ["Irradiance", fmt(sweep.irradiance, 0, "W/m²")], ["Temperature", fmt(sweep.panel_temp, 1, "°C")],
  ];

  return (
    <section className="panel iv">
      <div className="section-head">
        <div>
          <h3>I-V curve tracer</h3>
          <p className="muted">Each sweep traces the panel from short circuit to open circuit. One hump on the
            power curve is normal; two or more humps means part of the panel is shaded.</p>
        </div>
      </div>
      <div className="iv-grid">
        <div className="sweep-list" role="listbox" aria-label="I-V sweeps">
          {sweeps.map((s) => {
            const si = statusInfo(s.status);
            const active = s.id === sweep.id;
            return (
              <button key={s.id} role="option" aria-selected={active} className={`sweep-row${active ? " active" : ""}`}
                onClick={() => setSelected(s.id)}>
                <span className="lvl" data-level={si.level}><StatusIcon level={si.level} size={16} /></span>
                <span className="sweep-time">{fmtTime(Date.parse(s.created_at), true)}</span>
                <span className="sweep-val">{fmt(s.pmax, 1, "W")}</span>
                <span className="sweep-status muted">{si.label}</span>
              </button>
            );
          })}
        </div>
        <div className="iv-detail">
          <p className="iv-title">
            <span className="lvl" data-level={info.level}><StatusIcon level={info.level} size={16} /></span>
            Sweep at {fmtTime(Date.parse(sweep.created_at), true)}, {info.label.toLowerCase()}
          </p>
          {error && <div className="empty">Could not load curve: {error}</div>}
          <div className="iv-charts">
            <CurveChart title="Current vs voltage (I-V)" data={data} y="i" unit="A" dec={3}
              mpp={sweep.vmp !== null && sweep.imp !== null ? { x: sweep.vmp, y: sweep.imp } : null} />
            <CurveChart title="Power vs voltage (P-V)" data={data} y="p" unit="W" dec={2}
              mpp={sweep.vmp !== null && sweep.pmax !== null ? { x: sweep.vmp, y: sweep.pmax } : null} />
          </div>
          <dl className="stats">
            {stats.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
        </div>
      </div>
    </section>
  );
}

type CurveProps = {
  title: string; data: { v: number; i: number; p: number }[]; y: "i" | "p"; unit: string; dec: number;
  mpp: { x: number; y: number } | null;
};

function CurveChart({ title, data, y, unit, dec, mpp }: CurveProps) {
  const xt = niceTicks(Math.max(0, ...data.map((d) => d.v)));
  const yt = niceTicks(Math.max(0, ...data.map((d) => d[y])) * 1.08);
  return (
    <figure className="curve">
      <figcaption>{title}</figcaption>
      {data.length === 0 ? <div className="empty">Loading…</div> : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 10, right: 14, bottom: 14, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="v" type="number" domain={[0, xt[xt.length - 1]]} ticks={xt} tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--axis)" }} tickLine={false}
              tickFormatter={(v: number) => String(+v.toFixed(1))}
              label={{ value: "Voltage (V)", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }} />
            <YAxis width={44} domain={[0, yt[yt.length - 1]]} ticks={yt} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => String(+v.toFixed(2))} />
            <Tooltip cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { v: number; i: number; p: number };
                return (
                  <div className="tooltip">
                    <div>{d.v.toFixed(2)} V at {d.i.toFixed(3)} A</div>
                    <div><strong>{d.p.toFixed(2)}</strong> W</div>
                  </div>
                );
              }} />
            <Line type="monotone" dataKey={y} stroke="var(--cell)" strokeWidth={2} dot={false}
              activeDot={{ r: 4, stroke: "var(--glass)", strokeWidth: 2 }} isAnimationActive={false} />
            {mpp && (
              <ReferenceDot x={mpp.x} y={mpp.y} r={5} fill="var(--ink)" stroke="var(--glass)" strokeWidth={2}
                label={{ value: `Maximum ${mpp.y.toFixed(dec)} ${unit}`, position: "top", fill: "var(--ink-2)", fontSize: 11 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </figure>
  );
}
