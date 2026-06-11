#!/usr/bin/env python3
"""Side-by-side OLD vs NEW transform: 6190 linework (red) over orthophoto, Aile Ouest closeup."""
import glob, math
import numpy as np
import ezdxf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from PIL import Image

ROOT = "/Users/dragan/Documents/cad-mcp"
OX, OY, XOFF = 117027.344, 121045.953, 3205.5
OLD = {"0": (0.0, 5.0, -0.5), "1": (1.5, 0.0, -0.5)}
NEW = {"0": (0.003, 5.960, -3.136), "1": (0.334, -3.023, -3.073)}

def xform(rot, dx, dy):
    th = math.radians(rot); c, s = math.cos(th), math.sin(th)
    return lambda x, y: (c*x - s*y + dx, s*x + c*y + dy)

doc = ezdxf.readfile(f"{ROOT}/sources/6190_clean.dxf")
msp = doc.modelspace()

def sheet_segments(ox, f):
    segs = []
    for e in msp.query('LINE'):
        if e.dxf.layer not in ("Batiment", "Mur"): continue
        a = (e.dxf.start.x, e.dxf.start.y)
        if abs(a[0]-ox) > 80 or abs(a[1]-OY) > 80: continue
        b = (e.dxf.end.x, e.dxf.end.y)
        segs.append([f(a[0]-ox, a[1]-OY), f(b[0]-ox, b[1]-OY)])
    for e in msp.query('LWPOLYLINE'):
        if e.dxf.layer not in ("Batiment", "Contour bâtiment"): continue
        p = e.get_points("xy")
        if abs(p[0][0]-ox) > 80 or abs(p[0][1]-OY) > 80: continue
        q = [f(x-ox, y-OY) for x, y in p]
        if e.closed: q.append(q[0])
        segs += [[q[i], q[i+1]] for i in range(len(q)-1)]
    return segs

def pgw_extent(png):
    a, _, _, d, cx, cy = [float(l) for l in open(png[:-4]+".pgw")]
    im = Image.open(png); w, h = im.size
    return im, [cx-a/2, cx+a*w-a/2, cy+d*h+abs(d)/2, cy+abs(d)/2]

VIEWS = [("1", (-38, -2), (-48, 16)), ("0", (-38, -2), (-48, 16)), ("0", (-30, 12), (2, 26))]
for lvl, xl, yl in VIEWS:
    fig, axes = plt.subplots(1, 2, figsize=(20, 11))
    for ax, (tag, T) in zip(axes, (("ANCIEN (utilisé hier)", OLD), ("NOUVEAU (refit ICP)", NEW))):
        for png in sorted(glob.glob(f"{ROOT}/navvis_export/orthophotos/underlay/plan_*_{lvl}.png")):
            im, ext = pgw_extent(png)
            ax.imshow(np.asarray(im.convert("L")), extent=ext, cmap="gray", alpha=0.75, zorder=0)
        f = xform(*T[lvl])
        ox = OX if lvl == "0" else OX+XOFF
        ax.add_collection(LineCollection(sheet_segments(ox, f), colors="#d62728", lw=1.0, zorder=3))
        ax.set_xlim(*xl); ax.set_ylim(*yl); ax.set_aspect("equal")
        ax.set_title(f"+{lvl} — {tag}: rot={T[lvl][0]:.2f}° dx={T[lvl][1]:.2f} dy={T[lvl][2]:.2f}")
        ax.grid(alpha=0.2)
    out = f"/tmp/poc/diag_{lvl}_{abs(xl[0])}.png"
    fig.savefig(out, dpi=110, bbox_inches="tight"); plt.close(fig)
    print(out)
