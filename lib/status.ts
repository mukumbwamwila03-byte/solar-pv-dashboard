// What each firmware status code means, and what to do about it

export type Level = "good" | "neutral" | "warning" | "serious" | "critical";

export type StatusInfo = { label: string; level: Level; headline: string; advice: string };

export const STATUS: Record<string, StatusInfo> = {
  healthy:         { label: "Healthy",            level: "good",     headline: "The panel is healthy.",
    advice: "It is producing the power expected for the current sunlight and temperature." },
  low_light:       { label: "Low light",          level: "neutral",  headline: "Too little sunlight to diagnose.",
    advice: "Irradiance is below 150 W/m². This is normal at night, dawn and dusk." },
  not_calibrated:  { label: "Not calibrated",     level: "neutral",  headline: "The monitor needs calibrating.",
    advice: "Clean the panel, wait for full sun, then send c in the Serial Monitor or hold the button for 3 s." },
  boot:            { label: "Starting",           level: "neutral",  headline: "The monitor is starting.",
    advice: "The first readings arrive within a minute." },
  low_performance: { label: "Low performance",    level: "warning",  headline: "Output is below its usual level.",
    advice: "Check the wiring, connectors and panel surface." },
  dust:            { label: "Dust",               level: "warning",  headline: "Dust is reducing output.",
    advice: "Clean the panel with water and a soft cloth." },
  heavy_dust:      { label: "Heavy dust",         level: "serious",  headline: "Heavy dust is cutting output.",
    advice: "Clean the panel as soon as possible: the power loss is large." },
  shading:         { label: "Shading",            level: "serious",  headline: "Part of the panel is shaded.",
    advice: "Look for trees, buildings, bird droppings or leaves on the panel." },
  diode_fault:     { label: "Diode / cell fault", level: "critical", headline: "A bypass diode or cell string may have failed.",
    advice: "Open-circuit voltage is too low. Inspect the junction box on the back of the panel." },
  open_circuit:    { label: "Open circuit",       level: "critical", headline: "No current is flowing.",
    advice: "Check for a broken wire, a loose connector or a blown fuse." },
  hot_spot:        { label: "Hot spot",           level: "critical", headline: "The panel is overheating.",
    advice: "Inspect for cracked cells or a hot spot, and remove anything shading the panel." },
};

export const OFFLINE: StatusInfo = {
  label: "Offline", level: "neutral", headline: "The monitor is offline.",
  advice: "No new readings for over 3 minutes. Check the ESP32 power supply and WiFi.",
};

export const WAITING: StatusInfo = {
  label: "Waiting", level: "neutral", headline: "Waiting for the first reading.",
  advice: "Power on the ESP32 and check that it is connected to WiFi.",
};

export const LEVEL_LABEL: Record<Level, string> = {
  good: "Healthy",
  warning: "Warning",
  serious: "Serious",
  critical: "Critical",
  neutral: "No diagnosis",
};

export function statusInfo(code: string | null | undefined): StatusInfo {
  const label = code || "Unknown";
  return STATUS[code ?? ""] ?? { label, level: "neutral", headline: `${label}.`, advice: "" };
}

export function isFault(code: string): boolean {
  const l = statusInfo(code).level;
  return l === "warning" || l === "serious" || l === "critical";
}
