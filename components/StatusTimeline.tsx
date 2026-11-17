"use client";

import { useMemo, useState } from "react";
import type { Reading } from "@/lib/types";
import { LEVEL_LABEL, statusInfo, type Level } from "@/lib/status";
import { fmtDuration, fmtTime } from "@/lib/format";
import { medianInterval } from "@/lib/session";

type Props = { readings: Reading[]; start: number; end: number; withDate: boolean };
type Segment = { status: string; level: Level; label: string; start: number; end: number };

const LEVEL_ORDER: Level[] = ["good", "warning", "serious", "critical", "neutral"];
const HINT = "Point at a block to see the status and how long it lasted.";

// Consecutive readings with the same status become one block; long gaps (device off) stay empty
function buildSegments(readings: Reading[]): Segment[] {
  const median = medianInterval(readings);
  const gap = Math.max(5 * median, 120_000);
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  let lastT = -Infinity;
  for (const r of readings) {
    const t = Date.parse(r.created_at);
    if (cur && r.status === cur.status && t - lastT <= gap) {
      cur.end = t;
    } else {
      if (cur && t - lastT <= gap) cur.end = t;          // a status change closes the block at the next reading
      const info = statusInfo(r.status);
      cur = { status: r.status, level: info.level, label: info.label, start: t, end: t };
      segs.push(cur);
    }
    lastT = t;
  }
  // a block that ends at a gap (or at the newest reading) lasts one reading interval
  segs.forEach((s, k) => {
    const next = segs[k + 1];
    if (!next || next.start - s.end > gap || s.end === s.start) s.end = Math.min(s.end + median, next ? next.start : Infinity);
  });
  return segs;
}

export default function StatusTimeline({ readings, start, end, withDate }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const segments = useMemo(() => buildSegments(readings), [readings]);
  const span = Math.max(1, end - start);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));
  const levels = LEVEL_ORDER.filter((l) => segments.some((s) => s.level === l));
  const labels = [0, 0.25, 0.5, 0.75, 1].map((f) => start + f * span);
  const describe = (s: Segment) =>
    `${s.label}, ${fmtTime(s.start, withDate)} to ${fmtTime(s.end, withDate)} (${fmtDuration(s.end - s.start)})`;

  return (
    <section className="panel timeline">
      <div className="section-head">
        <h3>Diagnosed status over time</h3>
        <ul className="legend" aria-label="Legend">
          {levels.map((l) => (
            <li key={l} data-level={l}><span className="swatch" aria-hidden="true" />{LEVEL_LABEL[l]}</li>
          ))}
          <li><span className="swatch swatch-none" aria-hidden="true" />No data</li>
        </ul>
      </div>

      <div className="tl-band" onMouseLeave={() => setActive(null)}>
        {segments.map((s) => {
          const left = pct(s.start), width = Math.max(pct(s.end) - left, 0.25);
          const text = describe(s);
          return (
            <span key={`${s.status}-${s.start}`} className="tl-seg" data-level={s.level} tabIndex={0} role="img"
              aria-label={text} style={{ left: `${left}%`, width: `${width}%` }}
              onMouseEnter={() => setActive(text)} onFocus={() => setActive(text)} onBlur={() => setActive(null)} />
          );
        })}
      </div>
      <div className="tl-axis" aria-hidden="true">
        {/* Times depend on the viewer's clock, so draw them only once readings have loaded in the browser
            (the page is pre-rendered at build time; drawing them there causes a hydration mismatch) */}
        {labels.map((t, k) => <span key={k}>{readings.length ? fmtTime(t, withDate) : " "}</span>)}
      </div>
      <p className="tl-readout" aria-live="polite">{active ?? (segments.length ? HINT : "No readings in this period.")}</p>
    </section>
  );
}
