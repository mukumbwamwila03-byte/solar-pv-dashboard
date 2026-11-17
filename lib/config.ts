// Values copied from the firmware (section 1). Keep them in step with SolarFaultDetector.ino.

export const PANEL = {
  pmaxStc: 20.0,   // W
  vocStc: 21.6,    // V
  iscStc: 1.22,    // A
};

export const THRESHOLDS = {
  siDust: 0.93,      // soiling index below this = dust
  siHeavyDust: 0.8,  // soiling index below this = heavy dust
  tempHot: 75,       // degC
  gMinDiag: 150,     // W/m2
};

// The device counts as offline when no reading has arrived for this long
export const OFFLINE_AFTER_MS = 3 * 60 * 1000;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "";
export const DEFAULT_DEVICE = process.env.NEXT_PUBLIC_DEVICE_ID ?? "mzuni-pv-01";
