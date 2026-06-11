#!/usr/bin/env python3
"""Cross-validate OLD vs NEW 6190 transforms against independent targets:
A) NavVis as-built wall lines (cloud-extracted, ±2-5 cm) — wall-to-wall rms
B) room label points inside NavVis footprints (the original acceptance test)
"""
import json, math
import numpy as np
import ezdxf
from shapely.geometry import LineString, MultiLineString, Point, Polygon

ROOT = "/Users/dragan/Documents/cad-mcp"
OX, OY, XOFF = 117027.344, 121045.953, 3205.5
OLD = {"0": (0.0, 5.0, -0.5), "1": (1.5, 0.0, -0.5)}
NEW = {"0": (0.003, 5.960, -3.136), "1": (0.334, -3.023, -3.073)}

def xform(rot, dx, dy):
    th = math.radians(rot); c, s = math.cos(th), math.sin(th)
    return lambda x, y: (c*x - s*y + dx, s*x + c*y + dy)

# --- A) as-built walls target ---
asb = ezdxf.readfile(f"{ROOT}/navvis_export/ferme_du_temple_ASBUILT_N0_N1.dxf")
walls = {}
for lvl in ("0", "1"):
    segs = [LineString([(e.dxf.start.x/100-OX, e.dxf.start.y/100-OY),
                        (e.dxf.end.x/100-OX, e.dxf.end.y/100-OY)])
            for e in asb.modelspace().query(f'LINE[layer=="Bestaand-murs-N{lvl}"]')]
    walls[lvl] = MultiLineString(segs)

# 6190 wall sample points (Batiment layer = interior+exterior walls)
doc = ezdxf.readfile(f"{ROOT}/sources/6190_clean.dxf")
msp = doc.modelspace()
def wall_pts(ox):
    pts = []
    for e in msp.query('LINE[layer=="Batiment"]'):
        a = (e.dxf.start.x, e.dxf.start.y)
        if abs(a[0]-ox) > 80 or abs(a[1]-OY) > 80: continue
        b = (e.dxf.end.x, e.dxf.end.y)
        n = max(2, int(math.hypot(b[0]-a[0], b[1]-a[1])))
        for t in np.linspace(0, 1, n):
            pts.append((a[0]+t*(b[0]-a[0]) - ox, a[1]+t*(b[1]-a[1]) - OY))
    return np.array(pts)

print("A) 6190 'Batiment' wall pts -> nearest as-built scan wall (only pts within 1.5 m count as matched)")
for lvl, ox in (("0", OX), ("1", OX+XOFF)):
    P0 = wall_pts(ox)
    for tag, par in (("OLD", OLD[lvl]), ("NEW", NEW[lvl])):
        f = xform(*par)
        d = np.array([walls[lvl].distance(Point(f(x, y))) for x, y in P0])
        m = d[d < 1.5]
        print(f"  +{lvl} {tag}: matched {len(m)}/{len(d)} pts ({100*len(m)/len(d):.0f}%), "
              f"rms(matched)={np.sqrt((m**2).mean()):.3f} m, median(all)={np.median(d):.2f} m")

# --- B) room labels inside footprints ---
api = json.load(open(f"{ROOT}/navvis_export/raw/api_geometry.json"))
polys = [Polygon(b["scs_polygon"]["coordinates"][0]) for b in api["site_model"]["body"]]
aire = [e for e in msp.query('MTEXT[layer=="Légende"]') if "Aire" in e.text]
print("B) 45 Aire labels inside a NavVis footprint (buffer +0.5 m)")
for tag, T in (("OLD", OLD), ("NEW", NEW)):
    res = {"0": [0, 0], "1": [0, 0]}
    for e in aire:
        x, y = e.dxf.insert.x, e.dxf.insert.y
        lvl = "0" if x < 118500 else "1"
        ox = OX if lvl == "0" else OX+XOFF
        f = xform(*T[lvl])
        p = Point(f(x-ox, y-OY))
        res[lvl][1] += 1
        if any(pl.buffer(0.5).contains(p) for pl in polys): res[lvl][0] += 1
    print(f"  {tag}: +0 {res['0'][0]}/{res['0'][1]} inside · +1 {res['1'][0]}/{res['1'][1]} inside")
