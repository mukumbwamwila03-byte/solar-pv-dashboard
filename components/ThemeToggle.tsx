"use client";

import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const ORDER: Theme[] = ["auto", "light", "dark"];
const LABEL: Record<Theme, string> = { auto: "Auto theme", light: "Light", dark: "Dark" };
const KEY = "pv-theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("auto");

  // The inline script in app/layout.tsx has already applied the saved theme before paint
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch { /* storage blocked: stay on auto */ }
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
    try {
      if (next === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch { /* storage blocked: the choice lasts until reload */ }
  }

  return (
    <button type="button" className="chip chip-btn" onClick={cycle}
      aria-label={`Colour theme: ${LABEL[theme]}. Click to change.`}>
      <ThemeGlyph theme={theme} />
      {LABEL[theme]}
    </button>
  );
}

function ThemeGlyph({ theme }: { theme: Theme }) {
  const p = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true, fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const };
  if (theme === "light")
    return <svg {...p}><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" /></svg>;
  if (theme === "dark")
    return <svg {...p}><path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" /></svg>;
  return <svg {...p}><circle cx="8" cy="8" r="5.8" /><path d="M8 2.2v11.6" /><path d="M8 2.2a5.8 5.8 0 0 1 0 11.6Z" fill="currentColor" stroke="none" /></svg>;
}
