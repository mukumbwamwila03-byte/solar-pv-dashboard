import type { Reading, Sweep } from "@/lib/types";
import { THRESHOLDS } from "@/lib/config";
import { fmt } from "@/lib/format";

type Props = {
  latest: Reading | null;
  recent: Reading[];   // readings from the last 60 minutes
  sweeps: Sweep[];     // newest first
};

type Pt = { x: number; y: number };

function soilingNote(si: number | null | undefined): string {
  if (si === null || si === undefined) return "needs calibration or more sun";
  if (si >= THRESHOLDS.siDust) return "clean (1.00 = as calibrated)";
  if (si >= THRESHOLDS.siHeavyDust) return "dusty";
  return "heavy dust";
}

export default function Readouts({ latest, recent, sweeps }: Props) {
  const fromReadings = (f: keyof Reading): Pt[] =>
    recent.flatMap((r) => (typeof r[f] === "number" ? [{ x: Date.parse(r.created_at), y: r[f] as number }] : []));
  const last20 = sweeps.slice(0, 20).reverse();
  const fromSweeps = (f: keyof Sweep): Pt[] =>
    last20.flatMap((s) => (typeof s[f] === "number" ? [{ x: Date.parse(s.created_at), y: s[f] as number }] : []));

  const sweep = sweeps[0] ?? null;
  const v = latest?.panel_voltage, i = latest?.panel_current;

  const cells = [
    { label: "Irradiance", value: fmt(latest?.irradiance, 0), unit: "W/m²", note: "sunlight on the reference cell",
      series: fromReadings("irradiance"), color: "var(--sun)" },
    { label: "Power", value: fmt(latest?.panel_power, 2), unit: "W",
      note: v != null && i != null ? `${v.toFixed(2)} V at ${i.toFixed(3)} A` : "voltage and current not available",
      series: fromReadings("panel_power") },
    { label: "Panel temperature", value: fmt(latest?.panel_temp, 1), unit: "°C",
      note: `hot spot above ${THRESHOLDS.tempHot} °C`, series: fromReadings("panel_temp") },
    { label: "Soiling index", value: fmt(latest?.soiling_index, 2), unit: "",
      note: soilingNote(latest?.soiling_index), series: fromReadings("soiling_index") },
    { label: "Performance ratio", value: fmt(sweep?.performance_ratio, 2), unit: "",
      note: "maximum ÷ expected power", series: fromSweeps("performance_ratio") },
    { label: "Maximum power", value: fmt(sweep?.pmax, 1), unit: "W",
      note: sweep?.p_expected != null ? `expected ${sweep.p_expected.toFixed(1)} W` : "from the latest I-V sweep",
      series: fromSweeps("pmax") },
  ];

  return (
    <section className="readouts" aria-label="Latest readings">
      {cells.map((c) => (
        <div className="readout" key={c.label}>
          <div className="readout-label">{c.label}</div>
          <div className="readout-value">{c.value}{c.unit && c.value !== "–" && <span className="unit">{c.unit}</span>}</div>
          <div className="readout-note">{c.note}</div>
          <Sparkline points={c.series} color={c.color ?? "var(--cell)"} />
        </div>
      ))}
    </section>
  );
}

// Tiny trend line without axes. The vertical scale spans at least 10 % of the value's level,
// so sensor noise on a steady value stays flat instead of looking dramatic.
function Sparkline({ points, color }: { points: Pt[]; color: string }) {
  if (points.length < 2) return <div className="spark spark-empty" aria-hidden="true" />;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const level = Math.max(Math.abs(lo), Math.abs(hi));
  const minSpan = Math.max(level * 0.1, 1e-6);
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const W = 100, H = 30, pad = 3;
  const px = (x: number) => (x1 > x0 ? ((x - x0) / (x1 - x0)) * W : W);
  const py = (y: number) => pad + (1 - (y - lo) / (hi - lo)) * (H - 2 * pad);
  const d = points.map((p, k) => `${k ? "L" : "M"}${px(p.x).toFixed(2)} ${py(p.y).toFixed(2)}`).join("");
  const last = points[points.length - 1];
  return (
    <div className="spark" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
        <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="spark-dot" style={{ left: `${px(last.x)}%`, top: `${(py(last.y) / H) * 100}%`, background: color }} />
    </div>
  );
}
