// Row shapes of the two Supabase tables (see supabase_setup.sql)

export type Reading = {
  id: number;
  created_at: string;
  device_id: string;
  irradiance: number | null;        // W/m2
  ref_current: number | null;       // A
  panel_voltage: number | null;     // V
  panel_current: number | null;     // A
  panel_power: number | null;       // W
  panel_temp: number | null;        // degC
  soiling_index: number | null;     // 1.00 = clean
  performance_ratio: number | null; // from the latest I-V sweep
  status: string;
};

export type Sweep = {
  id: number;
  created_at: string;
  device_id: string;
  irradiance: number | null;
  panel_temp: number | null;
  voc: number | null;
  isc: number | null;
  pmax: number | null;
  vmp: number | null;
  imp: number | null;
  fill_factor: number | null;
  p_expected: number | null;
  performance_ratio: number | null;
  peaks: number | null;
  status: string;
  points?: [number, number][];      // [voltage V, current A]
};
