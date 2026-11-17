// What each firmware status code means, and what to do about it

export type Level = "good" | "neutral" | "warning" | "serious" | "critical";

export type StatusInfo = { label: string; level: Level; advice: string };

export const STATUS: Record<string, StatusInfo> = {
  healthy:         { label: "Healthy",          level: "good",     advice: "The panel is producing the power expected for the current sunlight and temperature." },
  low_light:       { label: "Low light",        level: "neutral",  advice: "Sunlight is below 150 W/m², too weak to diagnose. This is normal at night, dawn or dusk." },
  not_calibrated:  { label: "Not calibrated",   level: "neutral",  advice: "Clean the panel, wait for full sun, then send c in the Serial Monitor or hold the button for 3 s." },
  boot:            { label: "Starting",         level: "neutral",  advice: "The device has just started." },
  low_performance: { label: "Low performance",  level: "warning",  advice: "Output is below the calibrated level. Check wiring, connectors and the panel surface." },
  dust:            { label: "Dust detected",    level: "warning",  advice: "Dust is reducing output. Clean the panel with water and a soft cloth." },
  heavy_dust:      { label: "Heavy dust",       level: "serious",  advice: "Heavy soiling is causing a large power loss. Clean the panel as soon as possible." },
  shading:         { label: "Shading",          level: "serious",  advice: "Part of the panel is shaded. Look for trees, buildings, bird droppings or leaves." },
  diode_fault:     { label: "Diode / cell fault", level: "critical", advice: "Open-circuit voltage is too low, so a bypass diode or cell string may have failed. Inspect the junction box." },
  open_circuit:    { label: "Open circuit",     level: "critical", advice: "No current is flowing. Check for a broken wire, loose connector or blown fuse." },
  hot_spot:        { label: "Hot spot",         level: "critical", advice: "The panel is overheating. Inspect for cracked cells or a hot spot, and remove any shading." },
};

export function statusInfo(code: string | null | undefined): StatusInfo {
  return STATUS[code ?? ""] ?? { label: code || "Unknown", level: "neutral", advice: "" };
}

export function isFault(code: string): boolean {
  const l = statusInfo(code).level;
  return l === "warning" || l === "serious" || l === "critical";
}
