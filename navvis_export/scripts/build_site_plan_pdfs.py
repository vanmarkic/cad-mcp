#!/usr/bin/env python3
"""
Build printable whole-site composite floor-plan PDFs for the Ferme du Temple.

Composites all 5 buildings' NavVis as-built orthophotos at their true site
coordinates (EPSG:8370, meters) for the ground floor (+0) and first floor (+1),
with vector overlays: building footprints (red), 6190 surveyor rooms (green),
metric grid, scale bar, north arrow, and a title block.

Outputs (in navvis_export/):
  site_plan_ground.pdf / .png   (+0)
  site_plan_first.pdf  / .png   (+1)
  site_plans.pdf                (both pages)
"""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrow, Rectangle
from matplotlib.backends.backend_pdf import PdfPages

Image.MAX_IMAGE_PIXELS = None  # allow large orthophotos

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path("/Users/dragan/Documents/cad-mcp/navvis_export")
ORTHO_DIR = ROOT / "orthophotos"
GEOREF = ORTHO_DIR / "georef.json"
GEOMETRY = ROOT / "raw" / "api_geometry.json"
ROOMS = ROOT / "areas" / "areas_6190_rooms.json"

# Buildings: ortho-filename token  ->  geometry "name"
BUILDINGS = {
    "AileOuest": "Aile Ouest",
    "AileSudEst": "Aile Sud-Est",
    "Atelier": "Atelier",
    "Chapelle": "Chapelle",
    "Maisonprincipale": "Maison principale",
}

# Site extent (meters) with a small margin
SITE_X = (-45.0, 37.0)
SITE_Y = (-52.0, 27.0)
MARGIN = 2.0

# A1 landscape sheet, inches
SHEET_W, SHEET_H = 33.1, 23.4
DPI = 200

SURVEY_DATE = "2026-06-04"
PLOT_DATE = "2026-06-09"


def load_inputs():
    georef = json.loads(GEOREF.read_text())
    geom = json.loads(GEOMETRY.read_text())["site_model"]["body"]
    footprints = {}
    for b in geom:
        coords = b.get("scs_polygon", {}).get("coordinates", [[]])[0]
        footprints[b.get("name")] = (coords, b.get("area"))
    rooms = json.loads(ROOMS.read_text())
    return georef, footprints, rooms


def effective_scale(x0, x1, sheet_w_in):
    """Approximate printed scale ratio: 1 : N for the drawn map width."""
    width_m = x1 - x0
    sheet_w_m = sheet_w_in * 0.0254
    return width_m / sheet_w_m


def draw_grid(ax, x0, x1, y0, y1):
    # 1 m light grid
    for xv in range(int(math.floor(x0)), int(math.ceil(x1)) + 1):
        ax.axvline(xv, color="cyan", alpha=0.10, lw=0.4, zorder=2)
    for yv in range(int(math.floor(y0)), int(math.ceil(y1)) + 1):
        ax.axhline(yv, color="cyan", alpha=0.10, lw=0.4, zorder=2)
    # 5 m heavier grid
    x5 = int(math.floor(x0 / 5.0) * 5)
    while x5 <= x1:
        ax.axvline(x5, color="cyan", alpha=0.30, lw=0.8, zorder=2)
        x5 += 5
    y5 = int(math.floor(y0 / 5.0) * 5)
    while y5 <= y1:
        ax.axhline(y5, color="cyan", alpha=0.30, lw=0.8, zorder=2)
        y5 += 5


def draw_scale_bar(ax, x0, x1, y0, y1, length_m=10.0):
    # bottom-left, inset from the plotted corner
    span_x = x1 - x0
    span_y = y1 - y0
    bx = x0 + 0.04 * span_x
    by = y0 + 0.05 * span_y
    h = 0.008 * span_y
    n = 5  # 5 segments of length_m/5
    seg = length_m / n
    for i in range(n):
        c = "black" if i % 2 == 0 else "white"
        ax.add_patch(Rectangle((bx + i * seg, by), seg, h,
                               facecolor=c, edgecolor="black",
                               lw=0.6, zorder=8))
    ax.plot([bx, bx + length_m], [by, by], color="black", lw=0.6, zorder=8)
    ax.text(bx, by + 1.6 * h, "0", ha="center", va="bottom",
            fontsize=7, zorder=8)
    ax.text(bx + length_m, by + 1.6 * h, f"{length_m:.0f} m",
            ha="center", va="bottom", fontsize=7, zorder=8)
    ax.text(bx + length_m / 2, by - 1.2 * h, "échelle métrique",
            ha="center", va="top", fontsize=6, color="black", zorder=8)


def draw_north_arrow(ax, x0, x1, y0, y1):
    # top-right, points +Y (north)
    span_x = x1 - x0
    span_y = y1 - y0
    ax = ax
    nx = x1 - 0.05 * span_x
    ny = y1 - 0.16 * span_y
    alen = 0.10 * span_y
    arr = FancyArrow(nx, ny, 0, alen, width=0.0,
                     head_width=0.025 * span_x, head_length=0.03 * span_y,
                     length_includes_head=True, color="black", zorder=9)
    ax.add_patch(arr)
    ax.text(nx, ny + alen + 0.012 * span_y, "N", ha="center", va="bottom",
            fontsize=12, fontweight="bold", zorder=9)


def render_floor(ax, floor_digit, floor_tag, georef, footprints, rooms):
    """floor_digit: '0' or '1'; floor_tag: '+0' or '+1'."""
    x0, x1 = SITE_X[0] - MARGIN, SITE_X[1] + MARGIN
    y0, y1 = SITE_Y[0] - MARGIN, SITE_Y[1] + MARGIN

    sparse = []  # buildings with little/no ortho on this floor

    # 1. orthophotos
    for token in BUILDINGS:
        key = f"plan_{token}_{floor_digit}"
        tif = ORTHO_DIR / f"{key}.tiff"
        g = georef.get(key)
        if not tif.exists() or g is None:
            sparse.append((token, "no ortho/georef"))
            continue
        img = np.array(Image.open(tif).convert("RGBA"))
        # flag near-empty (mostly transparent) orthos
        if img.shape[2] == 4:
            opaque_frac = float((img[:, :, 3] > 8).mean())
            if opaque_frac < 0.02:
                sparse.append((token, f"sparse ortho ({opaque_frac*100:.1f}% opaque)"))
        ax.imshow(
            img,
            extent=[g["world_xmin"], g["world_xmax"],
                    g["world_ymin"], g["world_ymax"]],
            origin="upper", interpolation="nearest", zorder=1,
        )

    # 2. footprints (red)
    for token, name in BUILDINGS.items():
        coords, _area = footprints.get(name, ([], None))
        if not coords:
            continue
        poly = np.array(coords)
        if not np.allclose(poly[0], poly[-1]):
            poly = np.vstack([poly, poly[0]])
        ax.plot(poly[:, 0], poly[:, 1], color="red", lw=1.5, zorder=3)

    # 3. 6190 rooms for this floor (green)
    for r in rooms:
        if r.get("floor") != floor_tag:
            continue
        nx, ny = r.get("nx"), r.get("ny")
        if nx is None or ny is None:
            continue
        label = f"{r['id']}\n{r['area_m2']:.0f}m²"
        hsp = r.get("hsp_m")
        if hsp:
            label += f"\nH{hsp:.1f}"
        ax.plot(nx, ny, marker="o", ms=3.5, mfc="lime", mec="darkgreen",
                mew=0.6, zorder=5)
        ax.text(nx, ny, label, fontsize=5.2, ha="center", va="center",
                color="darkgreen", zorder=6,
                bbox=dict(boxstyle="round,pad=0.15", fc="white",
                          ec="green", lw=0.4, alpha=0.78))

    # 4. grid
    draw_grid(ax, x0, x1, y0, y1)

    # 5. scale bar + north arrow + axis labels
    draw_scale_bar(ax, x0, x1, y0, y1, length_m=10.0)
    draw_north_arrow(ax, x0, x1, y0, y1)

    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.set_xlabel("X site (m) — Est →", fontsize=8)
    ax.set_ylabel("Y site (m) — Nord ↑", fontsize=8)
    ax.tick_params(labelsize=7)

    return x0, x1, y0, y1, sparse


def title_block(fig, floor_label, scale_ratio):
    txt = (
        f"FERME DU TEMPLE — PLAN {floor_label} — "
        f"relevé as-built NavVis (ImmoPass, {SURVEY_DATE})\n"
        f"Échelle ≈ 1:{scale_ratio:.0f}   ·   coords site EPSG:8370   ·   "
        f"date {PLOT_DATE}\n"
        "emprises rouges = NavVis ; pièces vertes = relevé géomètre 6190 (indicatif)"
    )
    fig.text(0.012, 0.012, txt, fontsize=9, ha="left", va="bottom",
             family="monospace",
             bbox=dict(boxstyle="round,pad=0.5", fc="white", ec="black", lw=1.0))


def build_figure(floor_digit, floor_tag, floor_label, inputs):
    georef, footprints, rooms = inputs
    fig = plt.figure(figsize=(SHEET_W, SHEET_H))
    ax = fig.add_axes([0.045, 0.05, 0.93, 0.90])
    x0, x1, y0, y1, sparse = render_floor(
        ax, floor_digit, floor_tag, georef, footprints, rooms
    )
    scale_ratio = effective_scale(x0, x1, SHEET_W * 0.90)
    ax.set_title(
        f"FERME DU TEMPLE — PLAN {floor_label} — NavVis as-built "
        f"(ImmoPass {SURVEY_DATE})   ≈ 1:{scale_ratio:.0f}",
        fontsize=13, fontweight="bold", pad=10,
    )
    title_block(fig, floor_label, scale_ratio)
    return fig, scale_ratio, sparse


def main():
    inputs = load_inputs()
    floors = [
        ("0", "+0", "REZ-DE-CHAUSSÉE +0", "ground"),
        ("1", "+1", "ÉTAGE +1", "first"),
    ]

    figs = []
    summary = []
    for fd, ftag, flabel, fname in floors:
        fig, scale_ratio, sparse = build_figure(fd, ftag, flabel, inputs)
        pdf_path = ROOT / f"site_plan_{fname}.pdf"
        png_path = ROOT / f"site_plan_{fname}.png"
        fig.savefig(pdf_path, dpi=DPI, bbox_inches="tight")
        fig.savefig(png_path, dpi=DPI, bbox_inches="tight")
        figs.append(fig)
        summary.append((flabel, scale_ratio, sparse, pdf_path, png_path))
        print(f"[{flabel}] scale ~1:{scale_ratio:.0f}")
        print(f"    -> {pdf_path}")
        print(f"    -> {png_path}")
        if sparse:
            for tok, why in sparse:
                print(f"    ! {tok}: {why}")

    # combined 2-page PDF
    combined = ROOT / "site_plans.pdf"
    with PdfPages(combined) as pdf:
        for fig in figs:
            pdf.savefig(fig, dpi=DPI, bbox_inches="tight")
    print(f"[combined] -> {combined}")

    for fig in figs:
        plt.close(fig)

    print("\nDONE.")
    for flabel, scale_ratio, sparse, pdf_path, png_path in summary:
        sz = pdf_path.stat().st_size / 1024
        print(f"  {flabel}: 1:{scale_ratio:.0f}  {pdf_path.name} ({sz:.0f} KB)")


if __name__ == "__main__":
    main()
