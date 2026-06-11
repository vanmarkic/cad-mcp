#!/usr/bin/env python3
"""Render overlay PNGs (per floor): ortho underlay + NavVis walls + 6190 (Albert) linework/labels."""
import glob, os
import ezdxf
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image

ROOT = "/Users/dragan/Documents/cad-mcp"
doc = ezdxf.readfile(f"{ROOT}/navvis_export/ferme_du_temple_OVERLAY_6190_navvis.dxf")
msp = doc.modelspace()

def lines_of(layer):
    segs = []
    for e in msp.query(f'LINE[layer=="{layer}"]'):
        segs.append([(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)])
    for e in msp.query(f'LWPOLYLINE[layer=="{layer}"]'):
        pts = e.get_points("xy")
        if e.closed and len(pts) > 1: pts = pts + [pts[0]]
        segs += [[pts[i], pts[i+1]] for i in range(len(pts)-1)]
    return segs

def texts_of(layer):
    out = []
    for e in msp.query(f'MTEXT[layer=="{layer}"]'):
        out.append((e.dxf.insert.x, e.dxf.insert.y, e.text))
    return out

def pgw_extent(png):
    pgw = png[:-4] + ".pgw"
    a, _, _, d, cx, cy = [float(l) for l in open(pgw)]
    im = Image.open(png); w, h = im.size
    return im, [cx - a/2, cx + a*w - a/2, cy + d*h + abs(d)/2, cy + abs(d)/2]

from matplotlib.collections import LineCollection
for lvl in ("0", "1"):
    fig, ax = plt.subplots(figsize=(16, 13))
    for png in sorted(glob.glob(f"{ROOT}/navvis_export/orthophotos/underlay/plan_*_{lvl}.png")):
        im, ext = pgw_extent(png)
        ax.imshow(np.asarray(im.convert("L")), extent=ext, cmap="gray", alpha=0.55, zorder=0)
    for e in msp.query('LWPOLYLINE[layer=="NAVVIS-FOOTPRINT"]'):
        pts = e.get_points("xy"); pts = pts + [pts[0]]
        ax.plot(*zip(*pts), color="#2060c0", lw=1.0, ls="--", zorder=2, alpha=0.8)
    ax.add_collection(LineCollection(lines_of(f"NAVVIS-MURS-{lvl}"), colors="black", lw=1.6, zorder=3))
    ax.add_collection(LineCollection(lines_of(f"6190-PLAN-{lvl}"), colors="#d62728", lw=0.8, zorder=4))
    for x, y, t in texts_of(f"6190-AIRES-{lvl}"):
        parts = dict(p.split(":") for p in t.split("\\P")[1:] if ":" in p)
        rid = t.split("\\P")[0]
        ax.annotate(f'{rid}: {parts.get("Aire","?")} m²', (x, y), fontsize=5.5,
                    color="#a01010", ha="center", zorder=5,
                    bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.65))
    ax.set_xlim(-50, 40); ax.set_ylim(-52, 30)
    ax.set_aspect("equal"); ax.grid(alpha=0.2)
    ax.set_xlabel("NavVis-local X (m)"); ax.set_ylabel("NavVis-local Y (m)")
    ax.set_title(f"Ferme du Temple — niveau +{lvl} — NOIR: murs NavVis (existant/scan) · "
                 f"ROUGE: plan 6190 Immo-Géo (J. Albert) · fond: orthophoto scan\n"
                 f"Document de travail 2026-06-11 — ne pas utiliser pour acte")
    out = f"{ROOT}/reference/overlay_6190_navvis_N{lvl}.png"
    fig.savefig(out, dpi=160, bbox_inches="tight")
    plt.close(fig)
    print("saved:", out)
