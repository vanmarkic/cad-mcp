#!/usr/bin/env python3
"""Build overlay DXF: NavVis as-built (existant) vs surveyor 6190 (Albert / Immo-Géo).

Frame: NavVis-local METRES (matches orthophoto underlays already placed in the base file).
Base : navvis_export/ferme_du_temple_PLANS_navvis_local_m.dxf  (ortho IMAGEs + footprints)
Adds :
  NAVVIS-MURS-0/1   as-built walls from ferme_du_temple_ASBUILT_N0_N1.dxf (cm 6190-frame -> /100 - O)
  6190-PLAN-0/1     Albert's building linework (Batiment, Contour bâtiment, Mur), per-sheet transform
  6190-AIRES-0/1    Albert's 45 'Aire:' room labels, prefixed with G*/F* ids
  6190-COTES-0/1    linear dimension texts
  6190-LIMITE       property limit lines
Transforms: REFIT 2026-06-11 by trimmed ICP ('Contour bâtiment' -> NavVis footprints),
visually validated against orthophotos (diagB_*.png). Supersedes the 2026-06-09
/tmp/cadwork/transform_refined.json placement (which was off ~2.5-3 m; +1 rot 1.5° spurious):
  ground: rot 0.003°, d=( 5.960, -3.136)   rms70 0.64 m (was 1.80)
  first : rot 0.334°, d=(-3.023, -3.073)   rms70 0.46 m (was 2.01)
Room-ID matching of Aire labels intentionally uses the OLD transform, because
areas_6190_rooms.json nx/ny were produced with it — placement uses NEW.
Originals untouched; output is a NEW file in navvis_export/ (image paths are relative to it).
"""
import json, math
import ezdxf

ROOT = "/Users/dragan/Documents/cad-mcp"
OX, OY, XOFF = 117027.344, 121045.953, 3205.5
TG = dict(rot=0.003, dx=5.960, dy=-3.136)
TF = dict(rot=0.334, dx=-3.023, dy=-3.073)
TG_OLD = dict(rot=0.0, dx=5.0, dy=-0.5)   # for room-ID matching only
TF_OLD = dict(rot=1.5, dx=0.0, dy=-0.5)
WIN = 80.0

def mk_xform(ox, oy, t):
    th = math.radians(t["rot"]); c, s = math.cos(th), math.sin(th)
    def f(x, y):
        x, y = x - ox, y - oy
        return c*x - s*y + t["dx"], s*x + c*y + t["dy"]
    return f

SHEETS = {
    "0": (OX,        OY, mk_xform(OX,        OY, TG), mk_xform(OX,        OY, TG_OLD)),
    "1": (OX + XOFF, OY, mk_xform(OX + XOFF, OY, TF), mk_xform(OX + XOFF, OY, TF_OLD)),
}

rooms = json.load(open(f"{ROOT}/navvis_export/areas/areas_6190_rooms.json"))

doc = ezdxf.readfile(f"{ROOT}/navvis_export/ferme_du_temple_PLANS_navvis_local_m.dxf")
msp = doc.modelspace()

LAYERS = [  # name, ACI color
    ("NAVVIS-MURS-0", 7), ("NAVVIS-MURS-1", 4),
    ("6190-PLAN-0", 1), ("6190-PLAN-1", 6),
    ("6190-AIRES-0", 1), ("6190-AIRES-1", 6),
    ("6190-COTES-0", 8), ("6190-COTES-1", 8),
    ("6190-LIMITE", 3), ("OVERLAY-NOTES", 7),
]
for name, color in LAYERS:
    if name not in doc.layers:
        doc.layers.add(name, color=color)

# ---- 1. NavVis as-built walls (cm, 6190 frame) -> NavVis-local m ----
asb = ezdxf.readfile(f"{ROOT}/navvis_export/ferme_du_temple_ASBUILT_N0_N1.dxf")
n_walls = {"0": 0, "1": 0}
for lvl in ("0", "1"):
    for e in asb.modelspace().query(f'LINE[layer=="Bestaand-murs-N{lvl}"]'):
        p1 = (e.dxf.start.x/100.0 - OX, e.dxf.start.y/100.0 - OY)
        p2 = (e.dxf.end.x/100.0 - OX, e.dxf.end.y/100.0 - OY)
        msp.add_line(p1, p2, dxfattribs={"layer": f"NAVVIS-MURS-{lvl}"})
        n_walls[lvl] += 1
print("NavVis walls imported:", n_walls)

# ---- 2. 6190 linework + labels, per sheet ----
src = ezdxf.readfile(f"{ROOT}/sources/6190_clean.dxf")
smsp = src.modelspace()

PLAN_LAYERS = {"Batiment", "Contour bâtiment", "Mur"}
def anchor(e):
    t = e.dxftype()
    if t == "LINE": return e.dxf.start.x, e.dxf.start.y
    if t == "LWPOLYLINE": p = e.get_points("xy")[0]; return p[0], p[1]
    if t in ("MTEXT", "TEXT"): return e.dxf.insert.x, e.dxf.insert.y
    return None

stats = {}
aire_matched = []
for lvl, (ox, oy, xf, xf_old) in SHEETS.items():
    for e in smsp:
        a = anchor(e)
        if a is None or abs(a[0]-ox) > WIN or abs(a[1]-oy) > WIN:
            continue
        t, lay = e.dxftype(), e.dxf.layer
        # walls / contours
        if lay in PLAN_LAYERS and t == "LINE":
            msp.add_line(xf(e.dxf.start.x, e.dxf.start.y), xf(e.dxf.end.x, e.dxf.end.y),
                         dxfattribs={"layer": f"6190-PLAN-{lvl}"})
        elif lay in PLAN_LAYERS and t == "LWPOLYLINE":
            pts = [(*xf(x, y), sw, ew, b) for x, y, sw, ew, b in e.get_points("xyseb")]
            msp.add_lwpolyline(pts, format="xyseb",
                               close=e.closed, dxfattribs={"layer": f"6190-PLAN-{lvl}"})
        # property limit (ground sheet context)
        elif lay == "Limite de propriété" and t == "LINE":
            msp.add_line(xf(e.dxf.start.x, e.dxf.start.y), xf(e.dxf.end.x, e.dxf.end.y),
                         dxfattribs={"layer": "6190-LIMITE"})
        # Aire room labels
        elif lay == "Légende" and t == "MTEXT" and "Aire" in e.text:
            nx, ny = xf(*a)
            mx, my = xf_old(*a)   # match ids in the frame areas_6190_rooms.json was built in
            floor = "+0" if lvl == "0" else "+1"
            cand = [(math.hypot(mx-r["nx"], my-r["ny"]), r) for r in rooms if r["floor"] == floor]
            d, r = min(cand, key=lambda c: c[0])
            rid = r["id"] if d < 6.0 else "?"
            aire_matched.append((rid, round(d, 2)))
            m = msp.add_mtext(f"{rid}\\P" + e.text, dxfattribs={
                "layer": f"6190-AIRES-{lvl}", "char_height": 0.45,
                "insert": (nx, ny)})
        # dimension texts
        elif lay == "Cotation Linéaire" and t == "TEXT":
            nx, ny = xf(*a)
            msp.add_text(e.dxf.text, dxfattribs={
                "layer": f"6190-COTES-{lvl}", "height": max(e.dxf.height/1.0, 0.3) if e.dxf.height < 10 else 0.4,
                "insert": (nx, ny), "rotation": e.dxf.rotation + (1.5 if lvl == "1" else 0.0)})
        key = (lvl, lay, t)
        stats[key] = stats.get(key, 0) + 1
print("6190 imported:", {f"{k[0]}/{k[1]}/{k[2]}": v for k, v in sorted(stats.items())})
unmatched = [m for m in aire_matched if m[0] == "?"]
print(f"Aire labels: {len(aire_matched)} matched, ids ok: {len(aire_matched)-len(unmatched)}, unmatched: {unmatched}")

# ---- 3. provenance note ----
note = (
    "SUPERPOSITION — Document de travail (2026-06-11, rev. B recalage ICP)\\P"
    "NavVis (existant, scan 3D ImmoPass) vs plan 6190 (Immo-Géo / J. Albert).\\P"
    "Cadre: NavVis-local, métres. 6190 = NavVis-local + (117027.344, 121045.953) "
    "(Lambert 2008 - 500000).\\P"
    "Recalage par feuille (ICP contours -> emprises NavVis, valide vs orthophotos): "
    "sol rot 0.003° d=(+5.960, -3.136) rms70=0.64 m; étage (déport feuille -3205.5 m en X) "
    "rot 0.334° d=(-3.023, -3.073) rms70=0.46 m.\\P"
    "Calques: NAVVIS-MURS-x (murs scannés), 6190-PLAN-x (linéaire Albert), 6190-AIRES-x "
    "(aires mesurées G*/F*), NAVVIS-PLAN-x (orthophotos).\\P"
    "NE PAS UTILISER POUR ACTE — valeurs à confirmer par le géométre."
)
msp.add_mtext(note, dxfattribs={"layer": "OVERLAY-NOTES", "char_height": 0.8,
                                "insert": (-45, 32), "width": 55})

out = f"{ROOT}/navvis_export/ferme_du_temple_OVERLAY_6190_navvis.dxf"
doc.saveas(out)
print("saved:", out)

# persist refit transforms durably (supersedes /tmp/cadwork/transform_refined.json for placement)
meta = {
    "date": "2026-06-11",
    "method": "trimmed ICP (70%), 6190 'Contour bâtiment' densified pts -> NavVis site_model "
              "footprint rings; scale fixed 1.0; visually validated against orthophotos",
    "frame": "NavVis-local m; nav = R(rot) @ (xy_6190 - O_sheet) + d",
    "OX": OX, "OY": OY, "xoffB": XOFF,
    "ground": {**TG, "rms70_m": 0.642, "median_m": 0.378},
    "first": {**TF, "rms70_m": 0.456, "median_m": 0.371},
    "old_superseded": {"ground": TG_OLD, "first": TF_OLD,
                       "note": "2026-06-09 fit; off ~2.5-3 m, +1 rot 1.5 deg spurious. "
                               "areas_6190_rooms.json nx/ny still carry the OLD transform."},
}
with open(f"{ROOT}/navvis_export/areas/transform_sheet_refit_icp.json", "w") as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)
print("transforms persisted -> navvis_export/areas/transform_sheet_refit_icp.json")

# audit
doc2 = ezdxf.readfile(out)
aud = doc2.audit()
print("audit errors:", len(aud.errors), "fixes:", len(aud.fixes))
