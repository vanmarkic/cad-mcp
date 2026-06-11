#!/usr/bin/env python3
"""Re-fit 6190 sheet->NavVis transforms (rot+trans, scale=1) by trimmed ICP.

Source: 6190 'Contour bâtiment' polylines per sheet (building outer walls).
Target: NavVis site_model footprint exterior rings (ground truth frame).
Robust: keep closest 70% of sample points each iteration (handles buildings
present in 6190 but absent from the 5 NavVis footprints, and vice versa).
"""
import json, math
import numpy as np
import ezdxf
from shapely.geometry import LineString, MultiLineString

ROOT = "/Users/dragan/Documents/cad-mcp"
OX, OY, XOFF = 117027.344, 121045.953, 3205.5
WIN = 80.0

# ---- target: NavVis footprints as one MultiLineString ----
api = json.load(open(f"{ROOT}/navvis_export/raw/api_geometry.json"))
rings = [LineString(b["scs_polygon"]["coordinates"][0]) for b in api["site_model"]["body"]]
target = MultiLineString(rings)

# ---- source: 6190 contour points per sheet ----
doc = ezdxf.readfile(f"{ROOT}/sources/6190_clean.dxf")
msp = doc.modelspace()

def sheet_points(ox):
    pts = []
    for e in msp.query('LWPOLYLINE[layer=="Contour bâtiment"]'):
        p = e.get_points("xy")
        if abs(p[0][0]-ox) > WIN or abs(p[0][1]-OY) > WIN: continue
        # densify: sample every ~1 m along each segment
        arr = np.array(p + ([p[0]] if e.closed else []))
        for a, b in zip(arr[:-1], arr[1:]):
            n = max(2, int(np.hypot(*(b-a))))
            for t in np.linspace(0, 1, n, endpoint=False):
                pts.append(a + t*(b-a))
    return np.array(pts) - [ox, OY]   # de-offset to local

def apply_t(P, rot_deg, dx, dy):
    th = math.radians(rot_deg); c, s = math.cos(th), math.sin(th)
    R = np.array([[c, -s], [s, c]])
    return P @ R.T + [dx, dy]

def rms_resid(P, trim=0.7):
    d = np.array([target.distance(__import__("shapely.geometry", fromlist=["Point"]).Point(p)) for p in P])
    d.sort()
    k = int(len(d)*trim)
    return float(np.sqrt((d[:k]**2).mean())), d

def icp(P0, rot, dx, dy, iters=30, trim=0.7):
    rot0, dx0, dy0 = rot, dx, dy
    from shapely.geometry import Point
    for it in range(iters):
        P = apply_t(P0, rot, dx, dy)
        # correspondences = nearest point on target
        Q = np.array([np.array(target.interpolate(target.project(Point(p))).coords[0]) for p in P])
        d = np.linalg.norm(P-Q, axis=1)
        keep = d <= np.quantile(d, trim)
        Pk, Qk = P[keep], Q[keep]
        # best rigid transform Pk->Qk (Kabsch, 2D, scale=1)
        cp, cq = Pk.mean(0), Qk.mean(0)
        H = (Pk-cp).T @ (Qk-cq)
        U, S, Vt = np.linalg.svd(H)
        D = np.diag([1, np.sign(np.linalg.det(Vt.T @ U.T))])
        R = Vt.T @ D @ U.T
        dth = math.degrees(math.atan2(R[1,0], R[0,0]))
        t = cq - (R @ cp)
        # compose increment onto current transform
        rot += dth
        th = math.radians(dth)
        c, s = math.cos(th), math.sin(th)
        dx, dy = c*dx - s*dy + t[0], s*dx + c*dy + t[1]
        if abs(dth) < 1e-4 and np.hypot(*t) < 1e-4: break
    return rot, dx, dy, it

for name, ox, start in (("ground(+0)", OX, (0.0, 5.0, -0.5)),
                        ("first (+1)", OX+XOFF, (1.5, 0.0, -0.5))):
    P0 = sheet_points(ox)
    from shapely.geometry import Point
    def stats(rot, dx, dy):
        P = apply_t(P0, rot, dx, dy)
        d = np.sort([target.distance(Point(p)) for p in P])
        k = int(len(d)*0.7)
        return np.sqrt((np.array(d[:k])**2).mean()), np.median(d)
    r0 = stats(*start)
    rot, dx, dy, it = icp(P0, *start)
    r1 = stats(rot, dx, dy)
    print(f"{name}: n={len(P0)}  OLD rot={start[0]:.2f} dx={start[1]:.2f} dy={start[2]:.2f} "
          f"-> rms70={r0[0]:.3f} med={r0[1]:.3f} m")
    print(f"{'':11s} NEW rot={rot:.3f} dx={dx:.3f} dy={dy:.3f} (iters={it}) "
          f"-> rms70={r1[0]:.3f} med={r1[1]:.3f} m")
