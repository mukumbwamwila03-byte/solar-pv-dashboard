import type { Reading } from "@/lib/types";
import { statusInfo } from "@/lib/status";
import { fmtAgo } from "@/lib/format";
import { StatusIcon } from "./Icons";

type Props = { latest: Reading | null; online: boolean; now: number };

export default function StatusHero({ latest, online, now }: Props) {
  if (!latest) {
    return (
      <section className="card hero" data-level="neutral">
        <div className="hero-main">
          <span className="hero-icon"><StatusIcon level="neutral" size={36} /></span>
          <div>
            <p className="eyebrow">Panel status</p>
            <h2 className="hero-label">Waiting for data</h2>
            <p className="hero-advice">No readings yet. Power on the ESP32 and check that it is connected to WiFi.</p>
          </div>
        </div>
      </section>
    );
  }
  const info = online ? statusInfo(latest.status) : { label: "Device offline", level: "neutral" as const,
    advice: "No new readings for over 3 minutes. Check the ESP32 power supply and WiFi." };
  const t = Date.parse(latest.created_at);
  return (
    <section className="card hero" data-level={info.level} aria-live="polite">
      <div className="hero-main">
        <span className="hero-icon"><StatusIcon level={info.level} size={36} /></span>
        <div>
          <p className="eyebrow">Panel status</p>
          <h2 className="hero-label">{info.label}</h2>
          <p className="hero-advice">{info.advice}</p>
        </div>
      </div>
      <div className="hero-meta">
        <span className={`pill ${online ? "pill-on" : "pill-off"}`}>
          <span className="dot" />{online ? "Device online" : "Device offline"}
        </span>
        <span className="muted">Last reading {fmtAgo(t, now)}</span>
        {!online && <span className="muted">Last status: {statusInfo(latest.status).label}</span>}
      </div>
    </section>
  );
}
