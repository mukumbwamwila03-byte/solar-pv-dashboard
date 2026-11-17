"""Download the device's data from Supabase into CSV files (analysis/data/).

Usage (from the solar-dashboard folder):
    python analysis/fetch_data.py                  # last 7 days
    python analysis/fetch_data.py --days 30
    python analysis/fetch_data.py --device mzuni-pv-01

Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY / NEXT_PUBLIC_DEVICE_ID from .env.local.
Only the publishable key is needed (read access).

Writes:
    data/readings.csv     one row per reading
    data/iv_sweeps.csv    one row per I-V sweep (summary values)
    data/iv_points.csv    every measured point of every sweep (sweep_id, voltage_V, current_A, power_W)
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from common import DATA_DIR, read_env

PAGE = 1000

READING_COLS = ["id", "created_at", "device_id", "irradiance", "ref_current", "panel_voltage", "panel_current",
                "panel_power", "panel_temp", "soiling_index", "performance_ratio", "status"]
SWEEP_COLS = ["id", "created_at", "device_id", "irradiance", "panel_temp", "voc", "isc", "pmax", "vmp", "imp",
              "fill_factor", "p_expected", "performance_ratio", "peaks", "status"]


def get_all(base: str, key: str, table: str, select: str, device: str, since: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            "select": select, "device_id": f"eq.{device}", "created_at": f"gte.{since}",
            "order": "created_at.asc", "limit": PAGE, "offset": offset,
        })
        req = urllib.request.Request(f"{base}/rest/v1/{table}?{query}", headers={"apikey": key, "Accept": "application/json"})
        if not key.startswith("sb_"):
            req.add_header("Authorization", f"Bearer {key}")
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                batch = json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            sys.exit(f"Supabase error {e.code} on {table}: {e.read().decode('utf-8', 'replace')}\n"
                     "401 = wrong key, 404 = wrong URL or table name.")
        except urllib.error.URLError as e:
            sys.exit(f"Could not reach Supabase: {e.reason}. Check your internet connection and the URL.")
        rows.extend(batch)
        print(f"  {table}: {len(rows)} rows", end="\r")
        if len(batch) < PAGE:
            break
        offset += PAGE
    print()
    return rows


def write_csv(path, cols, rows) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])


def main() -> None:
    ap = argparse.ArgumentParser(description="Download readings and I-V sweeps from Supabase.")
    ap.add_argument("--days", type=float, default=7, help="how many days back to download (default 7)")
    ap.add_argument("--device", help="device ID (default: NEXT_PUBLIC_DEVICE_ID from .env.local)")
    args = ap.parse_args()

    env = read_env()
    base = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = env.get("NEXT_PUBLIC_SUPABASE_KEY", "")
    device = args.device or env.get("NEXT_PUBLIC_DEVICE_ID", "mzuni-pv-01")
    if not base or not key:
        sys.exit("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_KEY in .env.local")
    if key.startswith("sb_secret_"):
        sys.exit("Use the publishable key (sb_publishable_...), never the secret key.")

    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()
    print(f"Downloading device '{device}' from the last {args.days:g} days...")
    readings = get_all(base, key, "readings", ",".join(READING_COLS), device, since)
    sweeps = get_all(base, key, "iv_sweeps", ",".join(SWEEP_COLS) + ",points", device, since)

    DATA_DIR.mkdir(exist_ok=True)
    write_csv(DATA_DIR / "readings.csv", READING_COLS, readings)
    write_csv(DATA_DIR / "iv_sweeps.csv", SWEEP_COLS, sweeps)
    with open(DATA_DIR / "iv_points.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sweep_id", "voltage_V", "current_A", "power_W"])
        for s in sweeps:
            for v, i in sorted(s.get("points") or [], key=lambda p: p[0]):
                w.writerow([s["id"], v, i, round(v * i, 4)])

    print(f"Saved {len(readings)} readings and {len(sweeps)} sweeps to {DATA_DIR}")
    if not readings:
        print("No readings in this period: run the device (or npm run simulate) first, or use --days with a larger number.")


if __name__ == "__main__":
    main()
