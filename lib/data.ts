// All reads from Supabase go through this file.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Reading, Sweep } from "./types";
import { SUPABASE_URL, SUPABASE_KEY } from "./config";
import { demo } from "./demo";

const SWEEP_COLS =
  "id,created_at,device_id,irradiance,panel_temp,voc,isc,pmax,vmp,imp,fill_factor,p_expected,performance_ratio,peaks,status";

let client: SupabaseClient | null = null;

export function isDemo(): boolean {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")) return true;
  return !SUPABASE_URL || !SUPABASE_KEY;
}

function sb(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return client;
}

// Supabase returns at most 1000 rows per request, so long ranges are read page by page.
export async function fetchReadings(device: string, sinceMs: number): Promise<Reading[]> {
  if (isDemo()) return demo.readingsSince(device, sinceMs);
  const since = new Date(sinceMs).toISOString();
  const all: Reading[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 25; page++) {
    const { data, error } = await sb()
      .from("readings")
      .select("*")
      .eq("device_id", device)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data as Reading[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export async function fetchSweeps(device: string, limit = 40): Promise<Sweep[]> {
  if (isDemo()) return demo.sweeps(device, limit);
  const { data, error } = await sb()
    .from("iv_sweeps")
    .select(SWEEP_COLS)
    .eq("device_id", device)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as Sweep[];
}

export async function fetchSweepPoints(id: number): Promise<[number, number][]> {
  if (isDemo()) return demo.sweepPoints(id);
  const { data, error } = await sb().from("iv_sweeps").select("points").eq("id", id).single();
  if (error) throw new Error(error.message);
  const pts = ((data?.points ?? []) as [number, number][]).slice();
  return pts.sort((a, b) => a[0] - b[0]);
}

type Handlers = {
  onReading: (r: Reading) => void;
  onSweep: (s: Sweep) => void;
  onLive: (live: boolean) => void;
};

// Pushes new rows to the page the moment the ESP32 uploads them (Supabase Realtime)
export function subscribe(device: string, h: Handlers): () => void {
  if (isDemo()) {
    h.onLive(true);
    const timer = setInterval(() => h.onReading(demo.next(device)), 10_000);
    return () => clearInterval(timer);
  }
  const channel = sb()
    .channel(`pv-${device}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "readings", filter: `device_id=eq.${device}` },
      (p) => h.onReading(p.new as Reading))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "iv_sweeps", filter: `device_id=eq.${device}` },
      (p) => { const { points, ...s } = p.new as Sweep; h.onSweep(s); })
    .subscribe((state) => h.onLive(state === "SUBSCRIBED"));
  return () => { sb().removeChannel(channel); };
}
