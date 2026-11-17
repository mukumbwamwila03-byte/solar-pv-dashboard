import type { Reading, Sweep } from "@/lib/types";
import { fmt } from "@/lib/format";
import { THRESHOLDS } from "@/lib/config";

type Props = { latest: Reading | null; sweep: Sweep | null };

export default function StatTiles({ latest, sweep }: Props) {
  const r = latest;
  const si = r?.soiling_index ?? null;
  const siNote = si === null ? "needs calibration or more sun"
    : si < THRESHOLDS.siHeavyDust ? "heavy dust" : si < THRESHOLDS.siDust ? "dusty" : "clean";
  const tiles = [
    { label: "Irradiance", value: fmt(r?.irradiance, 0), unit: "W/m²", note: "sunlight on the panel" },
    { label: "Power", value: fmt(r?.panel_power, 2), unit: "W", note: `${fmt(r?.panel_voltage, 2, "V")} × ${fmt(r?.panel_current, 3, "A")}` },
    { label: "Panel temperature", value: fmt(r?.panel_temp, 1), unit: "°C", note: `hot spot above ${THRESHOLDS.tempHot} °C` },
    { label: "Soiling index", value: fmt(si, 2), unit: "", note: `1.00 = clean · ${siNote}` },
    { label: "Performance ratio", value: fmt(sweep?.performance_ratio, 2), unit: "", note: "Pmax ÷ expected, last sweep" },
    { label: "Max power (last sweep)", value: fmt(sweep?.pmax, 1), unit: "W", note: `expected ${fmt(sweep?.p_expected, 1, "W")}` },
  ];
  return (
    <section className="tiles" aria-label="Latest measurements">
      {tiles.map((t) => (
        <div className="card tile" key={t.label}>
          <p className="tile-label">{t.label}</p>
          <p className="tile-value">{t.value}{t.unit && t.value !== "–" && <span className="tile-unit"> {t.unit}</span>}</p>
          <p className="tile-note">{t.note}</p>
        </div>
      ))}
    </section>
  );
}
