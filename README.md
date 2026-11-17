# Solar PV Fault & Dust Monitor: Web Dashboard

Live dashboard for the **Low-Cost Solar Panel Fault and Dust Detection System**
(ESP32 + INA219 + DS18B20), IEEE Mzuzu University Student Club.

The ESP32 uploads to two Supabase tables (`readings` every minute, `iv_sweeps` every 15 min).
This Next.js app reads them and shows:

- **Panel status** (healthy, dust, heavy dust, shading, diode fault, open circuit, hot spot…) with what to do about it
- **Latest measurements**: irradiance, power, temperature, soiling index, performance ratio, max power
- **History charts** for 1 h, 6 h, 24 h or 7 days, plus a **CSV download** for your report
- **I-V curve tracer**: the I-V and P-V curve of every sweep, with the maximum power point marked
- **Fault log**: each fault, when it started and ended, and how long it lasted

New rows appear by themselves (Supabase Realtime); you never need to refresh.

## Run it on your laptop (Windows)

You need **Node.js 20 or newer** (https://nodejs.org, LTS version).

```powershell
cd solar-dashboard
npm install
npm run dev
```

Open http://localhost:3000

## Settings: `.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=sb_publishable_...
NEXT_PUBLIC_DEVICE_ID=mzuni-pv-01
```

- Use the **publishable** key only. It is safe in a web page because the database only lets it *read* and *insert*.
  **Never** put the `sb_secret_...` key here.
- After changing `.env.local`, stop the server (Ctrl + C) and run `npm run dev` again.

## Useful links

| URL | Shows |
|---|---|
| `http://localhost:3000` | Your real device data |
| `http://localhost:3000/?demo=1` | Generated demo data (for previews; clearly labelled) |
| `http://localhost:3000/?device=other-id` | Another device's data |

## Files

| File | What it does |
|---|---|
| `components/Dashboard.tsx` | Page layout, time range, live updates |
| `components/StatusHero.tsx` | Big status card |
| `components/StatTiles.tsx` | Latest-value tiles |
| `components/TrendChart.tsx` | History charts |
| `components/IVViewer.tsx` | I-V / P-V curve viewer |
| `components/FaultLog.tsx` | Fault event table |
| `lib/data.ts` | All Supabase queries and the Realtime subscription |
| `lib/status.ts` | Meaning and advice for each status code |
| `lib/config.ts` | Panel nameplate and thresholds (keep in step with the firmware) |
| `lib/demo.ts` | Demo data generator |

## Troubleshooting

| Problem | Fix |
|---|---|
| Yellow "Demo data" banner | `.env.local` is missing or empty. Fill it in and restart `npm run dev` |
| Red "Could not load data" | Wrong URL or key, or the SQL setup script has not been run |
| "Waiting for data" | The ESP32 has not uploaded yet, or `NEXT_PUBLIC_DEVICE_ID` does not match `DEVICE_ID` in the firmware |
| Pill says "Connecting…" | Realtime is still connecting; check that both tables are in the `supabase_realtime` publication (the SQL script does this) |
| "Device offline" | No reading for over 3 minutes: check the ESP32 power and WiFi |
