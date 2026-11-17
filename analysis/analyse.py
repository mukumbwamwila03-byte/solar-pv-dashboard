"""Turn the downloaded data into report figures and tables (analysis/output/).

Usage (from the solar-dashboard folder, after fetch_data.py):
    python analysis/analyse.py
    python analysis/analyse.py --since "2026-11-17 08:00" --until "2026-11-17 12:00"

Outputs:
    fig1_timeseries.png          irradiance, power and status over time
    fig2_current_vs_irradiance.png panel current against irradiance by status, with the healthy fit I = kG
    fig3_soiling_index.png       soiling index with the dust thresholds
    fig4_temperature.png         panel temperature with the hot-spot threshold
    fig5_iv_curves.png           representative I-V and P-V curves for each status
    fig6_performance_ratio.png   performance ratio of every sweep
    fig7_time_in_status.png      how long the panel spent in each status
    summary_stats.csv, status_time.csv, fault_events.csv, sweep_stats_by_status.csv
    summary.md                   all results in one page, ready for the report
"""

from __future__ import annotations

import argparse
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

from common import (DATA_DIR, FAULTS, GRID, INK, INK2, LOCAL_TZ, MUTED, OUT_DIR, SI_DUST, SI_HEAVY_DUST,
                    STATUS_COLOR, STATUS_MARKER, STATUS_ORDER, TEMP_HOT, apply_style, label)

GAP_FACTOR = 3  # a gap longer than 3 x the normal reading interval counts as "device off"


# ---------------------------------------------------------------- loading

def load(since: str | None, until: str | None):
    rpath, spath, ppath = DATA_DIR / "readings.csv", DATA_DIR / "iv_sweeps.csv", DATA_DIR / "iv_points.csv"
    if not rpath.exists():
        sys.exit("No data yet. Run:  python analysis/fetch_data.py")
    r = pd.read_csv(rpath)
    s = pd.read_csv(spath) if spath.exists() else pd.DataFrame()
    p = pd.read_csv(ppath) if ppath.exists() else pd.DataFrame()
    for df in (r, s):
        if not df.empty:
            df["time"] = pd.to_datetime(df["created_at"], utc=True, format="ISO8601").dt.tz_convert(LOCAL_TZ)
    if since:
        t0 = pd.Timestamp(since).tz_localize(LOCAL_TZ)
        r = r[r["time"] >= t0]
        s = s[s["time"] >= t0] if not s.empty else s
    if until:
        t1 = pd.Timestamp(until).tz_localize(LOCAL_TZ)
        r = r[r["time"] <= t1]
        s = s[s["time"] <= t1] if not s.empty else s
    if r.empty:
        sys.exit("No readings in the chosen period.")
    r = r.sort_values("time").reset_index(drop=True)
    s = s.sort_values("time").reset_index(drop=True) if not s.empty else s
    return r, s, p


def add_intervals(r: pd.DataFrame) -> float:
    """Adds 'dt_s' = seconds each reading represents (0 across gaps). Returns the normal interval."""
    dt = r["time"].diff().shift(-1).dt.total_seconds()
    normal = float(dt.median()) if dt.notna().any() else 60.0
    cap = GAP_FACTOR * normal
    r["dt_s"] = dt.where(dt <= cap, 0).fillna(normal)
    r["gap_after"] = dt > cap
    return normal


# ---------------------------------------------------------------- tables

def fault_events(r: pd.DataFrame) -> pd.DataFrame:
    """Consecutive readings with the same status = one event; a device-off gap ends an event."""
    block = ((r["status"] != r["status"].shift()) | r["gap_after"].shift(fill_value=False)).cumsum()
    rows = []
    for _, g in r.groupby(block):
        st = g["status"].iloc[0]
        if st not in FAULTS:
            continue
        start, end = g["time"].iloc[0], g["time"].iloc[-1] + pd.to_timedelta(g["dt_s"].iloc[-1], unit="s")
        rows.append({"fault": label(st), "status_code": st, "start": start.strftime("%Y-%m-%d %H:%M"),
                     "end": end.strftime("%Y-%m-%d %H:%M"), "duration_min": round((end - start).total_seconds() / 60, 1),
                     "readings": len(g)})
    return pd.DataFrame(rows, columns=["fault", "status_code", "start", "end", "duration_min", "readings"])


def status_time(r: pd.DataFrame) -> pd.DataFrame:
    t = r.groupby("status")["dt_s"].sum() / 60
    total = t.sum()
    out = pd.DataFrame({"status_code": t.index, "status": [label(x) for x in t.index],
                        "minutes": t.values.round(1), "percent": (100 * t.values / total).round(1)})
    out["order"] = out["status_code"].map({s: i for i, s in enumerate(STATUS_ORDER)}).fillna(99)
    return out.sort_values("order").drop(columns="order").reset_index(drop=True)


def sweep_stats(s: pd.DataFrame) -> pd.DataFrame:
    if s.empty:
        return pd.DataFrame()
    g = s.groupby("status").agg(sweeps=("id", "count"), voc_V=("voc", "mean"), isc_A=("isc", "mean"),
                                pmax_W=("pmax", "mean"), fill_factor=("fill_factor", "mean"),
                                performance_ratio=("performance_ratio", "mean"), peaks=("peaks", "mean"))
    g = g.round({"voc_V": 2, "isc_A": 3, "pmax_W": 2, "fill_factor": 3, "performance_ratio": 3, "peaks": 1})
    g.insert(0, "status", [label(x) for x in g.index])
    g["order"] = [STATUS_ORDER.index(x) if x in STATUS_ORDER else 99 for x in g.index]
    return g.sort_values("order").drop(columns="order").reset_index(names="status_code")


def fit_healthy(r: pd.DataFrame):
    """Least-squares fit of I = k*G through the origin for healthy readings (current is proportional to sunlight)."""
    h = r[(r["status"] == "healthy") & r["irradiance"].notna() & r["panel_current"].notna() & (r["irradiance"] > 0)]
    if len(h) < 5:
        return None
    G, I = h["irradiance"].to_numpy(), h["panel_current"].to_numpy()
    k = float((G * I).sum() / (G * G).sum())
    ss_res = float(((I - k * G) ** 2).sum())
    ss_tot = float(((I - I.mean()) ** 2).sum())
    return {"k": k, "r2": 1 - ss_res / ss_tot if ss_tot > 0 else float("nan"), "n": len(h)}


def summary_stats(r, s, normal, fit) -> pd.DataFrame:
    energy_wh = float((r["panel_power"].fillna(0) * r["dt_s"]).sum() / 3600)
    online_min = r["dt_s"].sum() / 60
    diag = r[~r["status"].isin(["low_light", "boot", "not_calibrated"])]
    healthy_pct = 100 * diag.loc[diag["status"] == "healthy", "dt_s"].sum() / diag["dt_s"].sum() if len(diag) else float("nan")
    hs = s[s["status"] == "healthy"] if not s.empty else s
    rows = [
        ("Period start", r["time"].iloc[0].strftime("%Y-%m-%d %H:%M")),
        ("Period end", r["time"].iloc[-1].strftime("%Y-%m-%d %H:%M")),
        ("Readings", len(r)),
        ("I-V sweeps", len(s)),
        ("Normal reading interval (s)", round(normal)),
        ("Time device was online (min)", round(online_min, 1)),
        ("Energy delivered to the load (Wh)", round(energy_wh, 2)),
        ("Mean irradiance (W/m2)", round(r["irradiance"].mean(), 1)),
        ("Peak irradiance (W/m2)", round(r["irradiance"].max(), 1)),
        ("Mean panel power (W)", round(r["panel_power"].mean(), 2)),
        ("Peak panel power (W)", round(r["panel_power"].max(), 2)),
        ("Maximum panel temperature (C)", round(r["panel_temp"].max(), 1)),
        ("Mean soiling index", round(r["soiling_index"].mean(), 3)),
        ("Minimum soiling index", round(r["soiling_index"].min(), 3)),
        ("Mean PR of healthy sweeps", round(hs["performance_ratio"].mean(), 3) if len(hs) else ""),
        ("Healthy time while diagnosable (%)", round(healthy_pct, 1)),
        ("Fault events", ""),  # filled in by caller
    ]
    if fit:
        rows += [("Healthy fit I = kG: k (mA per W/m2)", round(1000 * fit["k"], 4)),
                 ("Healthy fit I = kG: R squared", round(fit["r2"], 4))]
    return pd.DataFrame(rows, columns=["quantity", "value"])


# ---------------------------------------------------------------- figures

def time_axis(ax, r):
    span_h = (r["time"].iloc[-1] - r["time"].iloc[0]).total_seconds() / 3600
    fmt = "%H:%M" if span_h <= 36 else "%d %b"
    ax.xaxis.set_major_formatter(mdates.DateFormatter(fmt, tz=r["time"].dt.tz))
    ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=4, maxticks=9, tz=r["time"].dt.tz))
    ax.set_xlabel(f"Time ({'Malawi time, ' if span_h <= 36 else ''}{r['time'].iloc[0].strftime('%d %b %Y') if span_h <= 36 else 'date'})")


def plot_line(ax, r, col, color="#2a78d6"):
    y = r[col].copy()
    y[r["gap_after"].shift(fill_value=False)] = np.nan  # break the line where the device was off
    ax.plot(r["time"], y, color=color, lw=1.6)


def status_legend(statuses, marker=False):
    out = []
    for st in [x for x in STATUS_ORDER if x in statuses]:
        if marker:
            out.append(Line2D([], [], ls="", marker=STATUS_MARKER[st], ms=6, mfc=STATUS_COLOR[st], mec="white",
                              mew=0.6, label=label(st)))
        else:
            out.append(Patch(facecolor=STATUS_COLOR[st], label=label(st)))
    return out


def fig_timeseries(r, path):
    fig, (a1, a2, a3) = plt.subplots(3, 1, figsize=(9, 6.6), sharex=True,
                                     gridspec_kw={"height_ratios": [3, 3, 0.9], "hspace": 0.35})
    plot_line(a1, r, "irradiance")
    a1.set_title("Irradiance, $G$")
    a1.set_ylabel("$G$ (W/m²)")
    a1.set_ylim(bottom=0)
    plot_line(a2, r, "panel_power")
    a2.set_title("Panel power, $P$")
    a2.set_ylabel("$P$ (W)")
    a2.set_ylim(bottom=0)
    # status strip: one coloured block per reading interval
    for st, g in r.groupby("status"):
        spans = [(mdates.date2num(t), max(dt, 1) / 86400) for t, dt in zip(g["time"], g["dt_s"])]
        a3.broken_barh(spans, (0, 1), facecolors=STATUS_COLOR.get(st, MUTED), edgecolor="none")
    a3.set_yticks([])
    a3.grid(False)
    a3.spines["left"].set_visible(False)
    a3.set_title("Diagnosed status")
    a3.legend(handles=status_legend(set(r["status"])), loc="upper center", bbox_to_anchor=(0.5, -0.9),
              ncol=min(6, r["status"].nunique()))
    time_axis(a3, r)
    fig.savefig(path)
    plt.close(fig)


def fig_current_vs_irradiance(r, fit, path):
    fig, ax = plt.subplots(figsize=(7.5, 5))
    d = r[r["irradiance"].notna() & r["panel_current"].notna()]
    for st in [x for x in STATUS_ORDER if x in set(d["status"])]:
        g = d[d["status"] == st]
        ax.scatter(g["irradiance"], g["panel_current"], s=60 if STATUS_MARKER[st] == "*" else 26, marker=STATUS_MARKER[st], c=STATUS_COLOR[st],
                   edgecolors="white", linewidths=0.5, label=label(st), zorder=3)
    gmin_d, gmax_d = float(d["irradiance"].min()), float(d["irradiance"].max())
    zoom = gmin_d > 0.4 * gmax_d          # narrow range (e.g. one sunny hour): zoom in on the data
    x0, x1 = (gmin_d - 30, gmax_d + 30) if zoom else (0.0, max(1000.0, gmax_d * 1.05))
    if fit:
        x = np.array([x0, x1])
        ax.plot(x, fit["k"] * x, color=INK, lw=1.2, ls="--", zorder=4, label="Fit to healthy readings")
        ax.text(0.03, 0.97, f"$I = k\\,G$,   $k = {1000 * fit['k']:.3f}$ mA per W/m²\n"
                f"$R^2 = {fit['r2']:.3f}$   ($n = {fit['n']}$)", transform=ax.transAxes, va="top",
                color=INK2, fontsize=9.5)
    ax.set_xlim(x0, x1)
    if zoom:
        lo, hi = float(d["panel_current"].min()), float(d["panel_current"].max())
        ax.set_ylim(lo - 0.08 * (hi - lo) - 0.02, hi + 0.25 * (hi - lo) + 0.02)
    else:
        ax.set_ylim(bottom=0)
    ax.set_title("Panel current against irradiance")
    ax.set_xlabel("Irradiance, $G$ (W/m²)")
    ax.set_ylabel("Panel current, $I$ (A)")
    ax.grid(axis="x", color=GRID)
    ax.legend(loc="upper left", bbox_to_anchor=(1.02, 1))
    fig.savefig(path)
    plt.close(fig)


def fig_threshold_series(r, col, title, ylabel, lines, path, ylim=None):
    d = r[r[col].notna()]
    fig, ax = plt.subplots(figsize=(9, 3.6))
    if d.empty:
        ax.text(0.5, 0.5, "No data in this period", ha="center", va="center", color=MUTED, transform=ax.transAxes)
    else:
        plot_line(ax, r, col)
        time_axis(ax, r)
    for y, txt in lines:
        ax.axhline(y, color=MUTED, lw=0.9, ls=(0, (4, 3)))
        ax.annotate(txt, xy=(1, y), xycoords=("axes fraction", "data"), xytext=(-4, 3),
                    textcoords="offset points", ha="right", va="bottom", color=INK2, fontsize=8.5)
    if ylim:
        ax.set_ylim(*ylim)
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    fig.savefig(path)
    plt.close(fig)


def fig_iv_curves(s, p, path):
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4.2))
    if s.empty or p.empty:
        for a in (a1, a2):
            a.text(0.5, 0.5, "No I-V sweeps in this period", ha="center", va="center", color=MUTED, transform=a.transAxes)
    else:
        # the latest sweep of each status
        picks = s.groupby("status").tail(1)
        picks = picks.assign(order=picks["status"].map(lambda x: STATUS_ORDER.index(x) if x in STATUS_ORDER else 99))
        for _, row in picks.sort_values("order").iterrows():
            pts = p[p["sweep_id"] == row["id"]].sort_values("voltage_V")
            if pts.empty:
                continue
            c, lab = STATUS_COLOR.get(row["status"], MUTED), label(row["status"])
            a1.plot(pts["voltage_V"], pts["current_A"], color=c, lw=1.6, label=lab)
            a2.plot(pts["voltage_V"], pts["power_W"], color=c, lw=1.6, label=lab)
            k = pts["power_W"].idxmax()
            a1.plot(pts.at[k, "voltage_V"], pts.at[k, "current_A"], "o", ms=5, mfc=c, mec="white", mew=1.2)
            a2.plot(pts.at[k, "voltage_V"], pts.at[k, "power_W"], "o", ms=5, mfc=c, mec="white", mew=1.2)
        a1.set_title("Current–voltage (I–V) curves")
        a1.set_xlabel("Voltage, $V$ (V)")
        a1.set_ylabel("Current, $I$ (A)")
        a2.set_title("Power–voltage (P–V) curves")
        a2.set_xlabel("Voltage, $V$ (V)")
        a2.set_ylabel("Power, $P$ (W)")
        for a in (a1, a2):
            a.set_xlim(left=0)
            a.set_ylim(bottom=0)
            a.grid(axis="x", color=GRID)
        a2.legend(loc="upper left", title="Latest sweep per status", title_fontsize=8.5)
        fig.text(0.5, -0.02, "Dots mark the maximum power point (MPP) of each curve.", ha="center", color=MUTED, fontsize=8.5)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def fig_pr(s, path):
    fig, ax = plt.subplots(figsize=(9, 3.8))
    d = s[s["performance_ratio"].notna()] if not s.empty else s
    if d.empty:
        ax.text(0.5, 0.5, "No I-V sweeps in this period", ha="center", va="center", color=MUTED, transform=ax.transAxes)
    else:
        for st in [x for x in STATUS_ORDER if x in set(d["status"])]:
            g = d[d["status"] == st]
            ax.scatter(g["time"], g["performance_ratio"], s=80 if STATUS_MARKER[st] == "*" else 34, marker=STATUS_MARKER[st], c=STATUS_COLOR[st],
                       edgecolors="white", linewidths=0.6, label=label(st), zorder=3)
        ax.axhline(1.0, color=MUTED, lw=0.9, ls=(0, (4, 3)))
        ax.legend(loc="lower left", ncol=min(4, d["status"].nunique()))
        ax.set_ylim(0, max(1.2, d["performance_ratio"].max() * 1.08))
        time_axis(ax, d)
    ax.set_title("Performance ratio of each I-V sweep,  $PR = \\dfrac{P_{max}}{P_{expected}}$", pad=10)
    ax.set_ylabel("$PR$")
    fig.savefig(path)
    plt.close(fig)


def fig_status_time(st, path):
    fig, ax = plt.subplots(figsize=(7.5, 0.5 + 0.42 * max(len(st), 1)))
    y = np.arange(len(st))[::-1]
    ax.barh(y, st["minutes"], color=[STATUS_COLOR.get(c, MUTED) for c in st["status_code"]], height=0.62)
    for yi, (m, pc) in zip(y, zip(st["minutes"], st["percent"])):
        ax.annotate(f"{m:.0f} min ({pc:.0f}%)", xy=(m, yi), xytext=(4, 0), textcoords="offset points",
                    va="center", color=INK2, fontsize=8.5)
    ax.set_yticks(y, st["status"])
    ax.tick_params(axis="y", length=0, labelcolor=INK)
    ax.grid(axis="y", visible=False)
    ax.grid(axis="x", color=GRID)
    ax.set_xlim(0, st["minutes"].max() * 1.22 if len(st) else 1)
    ax.set_xlabel("Time (minutes)")
    ax.set_title("Time spent in each status")
    fig.savefig(path)
    plt.close(fig)


# ---------------------------------------------------------------- report page

def md_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "_None._\n"
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    lines += ["| " + " | ".join("" if pd.isna(v) else str(v) for v in row) + " |" for row in df.itertuples(index=False)]
    return "\n".join(lines) + "\n"


def write_summary(path, stats, st, ev, ss, fit):
    out = ["# Solar PV fault and dust detection: data analysis\n",
           "_IEEE Mzuzu University Student Club · generated by analysis/analyse.py_\n",
           "## Summary\n", md_table(stats),
           "## Method\n",
           "Irradiance is estimated from the short-circuit current of the clean reference cell:\n",
           "$$G = 1000\\,\\frac{I_{sc,ref}}{I_{sc,ref,STC}}$$\n",
           "Expected maximum power, corrected for temperature:\n",
           "$$P_{expected} = P_{STC}\\,\\frac{G}{1000}\\,\\left[1 + \\gamma\\,(T_c - 25)\\right]$$\n",
           "Performance ratio and soiling index:\n",
           "$$PR = \\frac{P_{max}}{P_{expected}} \\qquad SI = \\frac{\\dfrac{I_{panel}}{I_{ref}}}{\\left(\\dfrac{I_{panel}}{I_{ref}}\\right)_{clean}}$$\n",
           "Energy delivered to the load is the sum of $P\\,\\Delta t$ over all readings, with gaps longer than "
           f"{GAP_FACTOR}× the normal reading interval treated as the device being off.\n"]
    if fit:
        out.append("A clean panel's current is proportional to irradiance. A least-squares fit through the origin "
                   f"for healthy readings gives $I = kG$ with $k = {1000 * fit['k']:.3f}$ mA per W/m² and "
                   f"$R^2 = {fit['r2']:.3f}$ ($n = {fit['n']}$). Readings below this line indicate soiling or shading.\n")
    out += ["## Time in each status\n", md_table(st),
            "## Fault events\n", md_table(ev),
            "## I-V sweep results by status (means)\n", md_table(ss),
            "## Figures\n",
            "1. `fig1_timeseries.png`: irradiance, power and diagnosed status over time\n",
            "2. `fig2_current_vs_irradiance.png`: panel current against irradiance by status, with the healthy fit $I = kG$; dust and shading fall below the line\n",
            "3. `fig3_soiling_index.png`: soiling index with the dust (0.93) and heavy-dust (0.80) thresholds\n",
            "4. `fig4_temperature.png`: panel temperature with the 75 °C hot-spot threshold\n",
            "5. `fig5_iv_curves.png`: I-V and P-V curves, latest sweep of each status, MPP marked\n",
            "6. `fig6_performance_ratio.png`: performance ratio of every sweep\n",
            "7. `fig7_time_in_status.png`: time spent in each status\n"]
    path.write_text("\n".join(out), encoding="utf-8")


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description="Make report figures and tables from the downloaded data.")
    ap.add_argument("--since", help='start time, Malawi time, e.g. "2026-11-17 08:00"')
    ap.add_argument("--until", help='end time, Malawi time, e.g. "2026-11-17 12:00"')
    args = ap.parse_args()

    apply_style()
    r, s, p = load(args.since, args.until)
    normal = add_intervals(r)
    fit = fit_healthy(r)
    ev, st, ss = fault_events(r), status_time(r), sweep_stats(s)
    stats = summary_stats(r, s, normal, fit)
    stats.loc[stats["quantity"] == "Fault events", "value"] = len(ev)

    OUT_DIR.mkdir(exist_ok=True)
    stats.to_csv(OUT_DIR / "summary_stats.csv", index=False)
    st.to_csv(OUT_DIR / "status_time.csv", index=False)
    ev.to_csv(OUT_DIR / "fault_events.csv", index=False)
    ss.to_csv(OUT_DIR / "sweep_stats_by_status.csv", index=False)

    fig_timeseries(r, OUT_DIR / "fig1_timeseries.png")
    fig_current_vs_irradiance(r, fit, OUT_DIR / "fig2_current_vs_irradiance.png")
    fig_threshold_series(r, "soiling_index", "Soiling index, $SI$", "$SI$",
                         [(SI_DUST, f"dust  {SI_DUST:.2f}"), (SI_HEAVY_DUST, f"heavy dust  {SI_HEAVY_DUST:.2f}")],
                         OUT_DIR / "fig3_soiling_index.png", ylim=(0.5, 1.1))
    fig_threshold_series(r, "panel_temp", "Panel temperature, $T_c$", "$T_c$ (°C)",
                         [(TEMP_HOT, f"hot spot  {TEMP_HOT:.0f} °C")], OUT_DIR / "fig4_temperature.png")
    fig_iv_curves(s, p, OUT_DIR / "fig5_iv_curves.png")
    fig_pr(s, OUT_DIR / "fig6_performance_ratio.png")
    fig_status_time(st, OUT_DIR / "fig7_time_in_status.png")
    write_summary(OUT_DIR / "summary.md", stats, st, ev, ss, fit)

    print(f"Analysed {len(r)} readings and {len(s)} sweeps ({r['time'].iloc[0]:%d %b %H:%M} to {r['time'].iloc[-1]:%d %b %H:%M}).")
    energy = stats.loc[stats["quantity"].str.startswith("Energy"), "value"].iloc[0]
    print(f"Fault events: {len(ev)}   Energy delivered: {energy} Wh")
    print(f"Figures and tables saved in {OUT_DIR}")


if __name__ == "__main__":
    main()
