import { LogoMark } from "./Icons";
import ThemeToggle from "./ThemeToggle";

type Props = { device: string; live: boolean };

export default function Header({ device, live }: Props) {
  return (
    <header className="top">
      <div className="brand">
        <LogoMark />
        <div>
          <h1>Solar PV Monitor</h1>
          <p className="brand-sub">Fault and dust detection for one test panel, IEEE Mzuzu University Student Club</p>
        </div>
      </div>
      <div className="top-meta">
        <span className="chip">Device <strong>{device}</strong></span>
        <span className={`chip live${live ? " is-live" : ""}`} title="Supabase Realtime connection" aria-live="polite">
          <span className="dot" aria-hidden="true" />{live ? "Live updates on" : "Connecting…"}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
