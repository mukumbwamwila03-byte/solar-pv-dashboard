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

export function SunIcon() {
  return (
    <svg {...base} width={26} height={26}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function DownloadIcon() {
  return <svg {...base} width={16} height={16}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>;
}
