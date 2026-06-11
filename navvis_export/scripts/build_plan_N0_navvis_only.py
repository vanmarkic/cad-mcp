#!/usr/bin/env python3
"""Floor plan +0 from NavVis ONLY (scan-derived). No 6190, no architect DWG, no PDF.

Frame: NavVis-local METRES (INSUNITS=6). +Y = Lambert 2008 grid north
(6190/Lambert = NavVis-local + pure translation).
Sources (all NavVis):
  - walls   : ferme_du_temple_ASBUILT_N0_N1.dxf layer Bestaand-murs-N0 (point-cloud vectorization)
              transformed cm 6190-frame -> /100 - O -> NavVis-local m
  - emprises: navvis_export/raw/api_geometry.json site_model polygons + areas
  - nuage   : sub-sampled scan points N0 (evidence), layer OFF by default
  - ortho   : orthophotos/underlay/plan_*_0.png (georeferenced, relative paths ->
              keep the DXF inside navvis_export/)
Output: navvis_export/ferme_du_temple_PLAN_N0_navvis_only.dxf
"""
import json, glob, os
import ezdxf

ROOT = "/Users/dragan/Documents/cad-mcp"
OX, OY = 117027.344, 121045.953

doc = ezdxf.new("R2018", setup=True)
doc.header["$INSUNITS"] = 6
msp = doc.modelspace()

for name, color in [("NAVVIS-EMPRISE", 5), ("NAVVIS-MURS-0", 7), ("NAVVIS-NUAGE-0", 8),
                    ("NAVVIS-PLAN-0", 7), ("NAVVIS-LABELS", 5), ("REPERES", 7), ("NOTES", 7)]:
    doc.layers.add(name, color=color)
doc.layers.get("NAVVIS-NUAGE-0").off()

# ---- emprises + labels (NavVis site model) ----
api = json.load(open(f"{ROOT}/navvis_export/raw/api_geometry.json"))
for b in api["site_model"]["body"]:
    ring = b["scs_polygon"]["coordinates"][0]
    msp.add_lwpolyline([(x, y) for x, y in ring], close=True,
                       dxfattribs={"layer": "NAVVIS-EMPRISE"})
    cx = sum(p[0] for p in ring)/len(ring); cy = sum(p[1] for p in ring)/len(ring)
    msp.add_mtext(f"{b['name']}\\Pemprise {b['area']:.0f} m² (NavVis)",
                  dxfattribs={"layer": "NAVVIS-LABELS", "char_height": 0.9,
                              "insert": (cx, cy), "attachment_point": 5})

# ---- walls + nuage from the as-built DXF (cm, 6190 frame -> local m) ----
asb = ezdxf.readfile(f"{ROOT}/navvis_export/ferme_du_temple_ASBUILT_N0_N1.dxf")
am = asb.modelspace()
nw = 0
for e in am.query('LINE[layer=="Bestaand-murs-N0"]'):
    msp.add_line((e.dxf.start.x/100-OX, e.dxf.start.y/100-OY),
                 (e.dxf.end.x/100-OX, e.dxf.end.y/100-OY),
                 dxfattribs={"layer": "NAVVIS-MURS-0"})
    nw += 1
np_ = 0
for e in am.query('POINT[layer=="Bestaand-nuage-N0"]'):
    msp.add_point((e.dxf.location.x/100-OX, e.dxf.location.y/100-OY),
                  dxfattribs={"layer": "NAVVIS-NUAGE-0"})
    np_ += 1
print(f"walls N0: {nw}  nuage pts: {np_}")

# ---- orthophoto underlays (pgw placement) ----
from PIL import Image
for png in sorted(glob.glob(f"{ROOT}/navvis_export/orthophotos/underlay/plan_*_0.png")):
    a, _, _, d, cx, cy = [float(l) for l in open(png[:-4]+".pgw")]
    w, h = Image.open(png).size
    rel = os.path.relpath(png, f"{ROOT}/navvis_export")
    idef = doc.add_image_def(filename=rel, size_in_pixel=(w, h))
    msp.add_image(image_def=idef,
                  insert=(cx - a/2, cy + d*h + abs(d)/2),
                  size_in_units=(w*a, h*abs(d)),
                  dxfattribs={"layer": "NAVVIS-PLAN-0"})

# ---- north arrow (+Y = grid north) + 10 m scale bar ----
ax_, ay = 36, 22
msp.add_lwpolyline([(ax_, ay), (ax_, ay+4)], dxfattribs={"layer": "REPERES"})
msp.add_solid([(ax_-0.6, ay+3), (ax_+0.6, ay+3), (ax_, ay+5)], dxfattribs={"layer": "REPERES"})
msp.add_text("N", dxfattribs={"layer": "REPERES", "height": 1.2, "insert": (ax_+1.0, ay+3.6)})
bx, by = 26, -50
for i in range(10):
    if i % 2 == 0:
        msp.add_solid([(bx+i, by), (bx+i+1, by), (bx+i, by+0.5), (bx+i+1, by+0.5)],
                      dxfattribs={"layer": "REPERES"})
msp.add_lwpolyline([(bx, by), (bx+10, by), (bx+10, by+0.5), (bx, by+0.5)], close=True,
                   dxfattribs={"layer": "REPERES"})
msp.add_text("0", dxfattribs={"layer": "REPERES", "height": 0.8, "insert": (bx-0.3, by+1.0)})
msp.add_text("10 m", dxfattribs={"layer": "REPERES", "height": 0.8, "insert": (bx+9.3, by+1.0)})

# ---- provenance ----
note = (
    "PLAN +0 — SOURCE NAVVIS UNIQUEMENT (2026-06-11)\\P"
    "Murs: vectorisation du nuage de points NavVis IVION (ImmoPass), coupe +0.85..1.35 m, "
    "précision ±2-5 cm, axes dominants par bâtiment.\\P"
    "Emprises + aires: site model NavVis. Fond: orthophotos géoréférencées (calque NAVVIS-PLAN-0).\\P"
    "Cadre: NavVis-local, métres; +Y = nord de grille Lambert 2008. "
    "6190/Lambert = local + (117027.344, 121045.953).\\P"
    "Aucune donnée géométre (6190) ni architecte (260608/PDF). Etat EXISTANT (ruine sans toiture). "
    "Maison principale: intérieur non capté à hauteur de coupe -> emprise seule.\\P"
    "Document de travail — ne pas utiliser pour acte."
)
msp.add_mtext(note, dxfattribs={"layer": "NOTES", "char_height": 0.7,
                                "insert": (-48, 30), "width": 52})

out = f"{ROOT}/navvis_export/ferme_du_temple_PLAN_N0_navvis_only.dxf"
doc.saveas(out)
aud = ezdxf.readfile(out).audit()
print("saved:", out, "| audit errors:", len(aud.errors))
