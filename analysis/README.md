# Data analysis scripts

Python scripts that download the device's data from Supabase and turn it into figures and tables for the project report.

## One-time setup (Windows)

1. Install **Python 3.11 or newer** from https://www.python.org/downloads/ and tick **"Add python.exe to PATH"** on the first screen.
2. In the `solar-dashboard` folder:

```powershell
python -m pip install -r analysis/requirements.txt
```

The scripts read the Supabase URL, publishable key and device ID from `.env.local` (the same file the dashboard uses).

## Every time

```powershell
python analysis/fetch_data.py          # download the last 7 days (use --days 30 for more)
python analysis/analyse.py             # make the figures and tables
```

To analyse only part of the data (Malawi time):

```powershell
python analysis/analyse.py --since "2026-11-17 08:00" --until "2026-11-17 12:00"
```

## What you get in `analysis/output/`

| File | Shows |
|---|---|
| `fig1_timeseries.png` | Irradiance, power and the diagnosed status over time |
| `fig2_current_vs_irradiance.png` | Panel current against irradiance by status, with the healthy fit I = kG (dust and shading fall below the line) |
| `fig3_soiling_index.png` | Soiling index with the dust (0.93) and heavy-dust (0.80) thresholds |
| `fig4_temperature.png` | Panel temperature with the 75 °C hot-spot threshold |
| `fig5_iv_curves.png` | I-V and P-V curves (latest sweep of each status) with the maximum power point |
| `fig6_performance_ratio.png` | Performance ratio of every I-V sweep |
| `fig7_time_in_status.png` | Time the panel spent in each status |
| `summary_stats.csv` | Period, energy (Wh), mean/peak irradiance and power, max temperature, soiling, PR, fit |
| `status_time.csv` | Minutes and % in each status |
| `fault_events.csv` | Every fault: start, end, duration |
| `sweep_stats_by_status.csv` | Mean Voc, Isc, Pmax, fill factor, PR and peaks for each status |
| `summary.md` | All of the above on one page, with the equations, ready for the report |

Figures are 300 dpi PNGs, good for Word or printing. The CSV files open in Excel.

## Notes

- A gap longer than 3× the normal reading interval is treated as "device off": lines break there and it does not count towards energy or time in status.
- Times are shown in Malawi time (Africa/Blantyre, UTC+2).
- `analysis/data/` and `analysis/output/` are not uploaded to GitHub (see `.gitignore`).
