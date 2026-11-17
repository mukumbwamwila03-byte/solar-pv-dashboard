"""Shared settings for the analysis scripts (Solar PV Fault & Dust Detection System)."""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
DATA_DIR = HERE / "data"
OUT_DIR = HERE / "output"

LOCAL_TZ = "Africa/Blantyre"   # Malawi time (CAT, UTC+2)

# Panel nameplate and thresholds - keep in step with the firmware (section 1)
PANEL_PMAX_STC = 20.0   # W
PANEL_VOC_STC = 21.6    # V
PANEL_ISC_STC = 1.22    # A
SI_DUST = 0.93
SI_HEAVY_DUST = 0.80
TEMP_HOT = 75.0
G_MIN_DIAG = 150.0

# Status codes from the firmware, in a fixed order (colour follows the status, never its rank)
STATUS_ORDER = ["healthy", "dust", "heavy_dust", "shading", "diode_fault",
                "open_circuit", "low_light", "hot_spot", "low_performance", "not_calibrated", "boot"]
STATUS_LABEL = {
    "healthy": "Healthy", "dust": "Dust", "heavy_dust": "Heavy dust", "shading": "Shading",
    "diode_fault": "Diode / cell fault", "open_circuit": "Open circuit", "low_light": "Low light",
    "hot_spot": "Hot spot", "low_performance": "Low performance", "not_calibrated": "Not calibrated",
    "boot": "Starting",
}
FAULTS = {"dust", "heavy_dust", "shading", "diode_fault", "open_circuit", "hot_spot", "low_performance"}

# Validated categorical palette (light), assigned in fixed order; extra statuses share muted grey
_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
STATUS_COLOR = {s: (_PALETTE[i] if i < len(_PALETTE) else "#898781") for i, s in enumerate(STATUS_ORDER)}
# Marker shapes: a second cue so statuses are not told apart by colour alone
_MARKERS = ["o", "s", "D", "^", "v", "X", "P", "*", "h", "p", "."]
STATUS_MARKER = {s: _MARKERS[i] for i, s in enumerate(STATUS_ORDER)}

INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
SURFACE = "#ffffff"


def label(status: str) -> str:
    return STATUS_LABEL.get(status, status)


def read_env() -> dict[str, str]:
    """Settings from environment variables, then ../.env.local, then ../.env."""
    env: dict[str, str] = {}
    for name in (".env.local", ".env"):
        f = PROJECT / name
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_KEY", "NEXT_PUBLIC_DEVICE_ID"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def apply_style() -> None:
    import matplotlib as mpl
    mpl.rcParams.update({
        "figure.dpi": 110, "savefig.dpi": 300, "savefig.bbox": "tight",
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE,
        "font.family": "DejaVu Sans", "font.size": 9.5,
        "axes.edgecolor": AXIS, "axes.linewidth": 0.8, "axes.labelcolor": INK2,
        "axes.titlesize": 11, "axes.titleweight": "bold", "axes.titlecolor": INK, "axes.titlelocation": "left",
        "axes.spines.top": False, "axes.spines.right": False,
        "axes.grid": True, "axes.grid.axis": "y", "grid.color": GRID, "grid.linewidth": 0.7,
        "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelcolor": INK2, "ytick.labelcolor": INK2,
        "legend.frameon": False, "legend.fontsize": 8.5,
        "lines.linewidth": 1.6, "mathtext.fontset": "dejavusans",
    })
