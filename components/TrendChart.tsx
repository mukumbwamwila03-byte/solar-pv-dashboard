"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Point } from "@/lib/format";
import { fmtTime } from "@/lib/format";

type Threshold = { y: number; label: string };

type Props = {
  title: string;
  subtitle: string;
  field: string;
  unit: string;
  decimals: number;
  data: Point[];
  start: number;
  end: number;
  withDate: boolean;
  color?: string;
  thresholds?: Threshold[];
  domain?: [number | "auto", number | "auto"];
  ticks?: number[];
};

export default function TrendChart(p: Props) {
  const hasData = p.data.some((d) => d[p.field] !== null && d[p.field] !== undefined);
  const color = p.color ?? "var(--cell)";
  return (
    <figure className="panel chart">
      <figcaption>
        <h3>{p.title}</h3>
        <p className="muted">{p.subtitle}</p>
      </figcaption>
      {!hasData ? (
        <div className="empty">No data in this period</div>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={p.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="t" type="number" scale="time" domain={[p.start, p.end]}
              tickFormatter={(v) => fmtTime(v, p.withDate)} tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={40} />
            <YAxis domain={p.domain ?? ["auto", "auto"]} ticks={p.ticks} width={44} tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={false} tickLine={false} tickFormatter={(v: number) => String(+v.toFixed(2))} />
            {p.thresholds?.map((th) => (
              <ReferenceLine key={th.label} y={th.y} stroke="var(--axis)" strokeDasharray="4 4"
                label={{ value: th.label, position: "insideBottomRight", fill: "var(--muted)", fontSize: 11 }} />
            ))}
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || payload[0].value === null) return null;
                return (
                  <div className="tooltip">
                    <div className="muted">{fmtTime(Number(label), true)}</div>
                    <div><strong>{Number(payload[0].value).toFixed(p.decimals)}</strong> {p.unit}</div>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey={p.field} stroke={color} strokeWidth={2} dot={false}
              activeDot={{ r: 4, stroke: "var(--glass)", strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </figure>
  );
}
