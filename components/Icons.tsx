import type { Level } from "@/lib/status";

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function StatusIcon({ level, size = 20 }: { level: Level; size?: number }) {
  const p = { ...base, width: size, height: size };
  if (level === "good")
    return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16 9.8" /></svg>;
  if (level === "warning" || level === "serious")
    return <svg {...p}><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" /><path d="M12 10v4.2M12 17.2v.1" /></svg>;
  if (level === "critical")
    return <svg {...p}><path d="M8.2 2.8h7.6l5.4 5.4v7.6l-5.4 5.4H8.2l-5.4-5.4V8.2l5.4-5.4Z" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.7v.1" /></svg>;
}

// Logo: a solar cell (navy square with faint busbar grid) carrying a P-V curve that rises then flattens
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="logo-mark">
      <rect width="40" height="40" rx="10" fill="#13203b" />
      <path d="M13.3 0v40M26.7 0v40M0 13.3h40M0 26.7h40" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1" />
      <path d="M7 31C12 19.5 17 13.6 23 11.6c3.6-1.2 6.6-1.4 10-1.4" fill="none" stroke="#f2b134"
        strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return <svg {...base} width={16} height={16}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>;
}
