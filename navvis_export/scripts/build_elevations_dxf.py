#!/usr/bin/env python3
"""Build an annotated 'elevations & coupes' DXF for the Ferme du Temple from
NavVis vertical orthophoto TIFFs.

Geometry fact: every TIFF is rendered over a vertical world-Z window
z = -1.5 m (bottom row) to +13.0 m (top row) = 14.5 m tall, at true scale.
  world height = 14.5 m (always)
  world width  = width_px * 14.5 / height_px
DXF Y axis == true elevation z (images inserted at y = -1.5).
"""
import csv
import os
import ezdxf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# ---------------------------------------------------------------- paths
HERE = os.path.dirname(os.path.abspath(__file__))
NAV = os.path.dirname(HERE)                       # .../navvis_export
FC = os.path.join(NAV, "facades_coupes")
UNDERLAY = os.path.join(FC, "underlay")
OUT_DXF = os.path.join(NAV, "ferme_du_temple_ELEVATIONS_m.dxf")
CSV_PATH = os.path.join(FC, "facade_heights.csv")

os.makedirs(UNDERLAY, exist_ok=True)

# ---------------------------------------------------------------- z window
Z_BOTTOM = -1.5
Z_TOP = 13.0
WORLD_H = Z_TOP - Z_BOTTOM  # 14.5

GAP = 3.0          # gap between adjacent drawings
BAND_GAP = 8.0     # gap between elevations band and coupes band

# Elevations grouped by building, NS then EW.
BUILDINGS = ["AileOuest", "AileSudEst", "Atelier", "Chapelle", "Maisonprincipale"]
ELEV_ORDER = []
for b in BUILDINGS:
    ELEV_ORDER.append((f"elev_{b}_NS", b, "NS"))
    ELEV_ORDER.append((f"elev_{b}_EW", b, "EW"))

# Coupes (second band).
COUPE_ORDER = [
    ("coupe_AileOuest_transv2", "AileOuest"),
    ("coupe_AileSudEst_transv2", "AileSudEst"),
    ("coupe_Atelier_transv2", "Atelier"),
    ("coupe_MaisonPrinc_transv", "MaisonPrinc"),
]

PRETTY = {
    "AileOuest": "Aile Ouest",
    "AileSudEst": "Aile Sud-Est",
    "Atelier": "Atelier",
    "Chapelle": "Chapelle",
    "Maisonprincipale": "Maison principale",
    "MaisonPrinc": "Maison principale",
}

# ---------------------------------------------------------------- load eaves/ground
heights = {}
with open(CSV_PATH, newline="") as f:
    for row in csv.DictReader(f):
        heights[row["elevation"]] = {
            "ground_z": float(row["ground_z"]),
            "eaves_z": float(row["eaves_z"]),
            "ridge_z": float(row["ridge_z"]),
        }


# ---------------------------------------------------------------- step 1: PNG underlays
def composite_to_png(name):
    src = os.path.join(FC, name + ".tiff")
    dst = os.path.join(UNDERLAY, name + ".png")
    im = Image.open(src)
    w, h = im.size
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[3])  # alpha as mask
    bg.save(dst)
    return dst, w, h


# ---------------------------------------------------------------- build DXF
doc = ezdxf.new("R2018")
doc.header["$INSUNITS"] = 6  # meters
msp = doc.modelspace()

# linetype for dashed eaves line
if "DASHED" not in doc.linetypes:
    doc.linetypes.add("DASHED", pattern=[0.5, 0.35, -0.15], description="Dashed __ __")

# annotation / scale / notes layers
doc.layers.add("ELEV-ANNOT", color=1)
doc.layers.add("Z-SCALE", color=5)
doc.layers.add("NOTES", color=2)

TXT_TITLE = 0.6
TXT_LABEL = 0.4
TXT_TICK = 0.3

placed = []  # (name, insert_x, width_m, kind)


def add_image(name, layer, insert_x):
    dst, px, py = composite_to_png(name)
    width_m = px * WORLD_H / py
    rel = "facades_coupes/underlay/" + name + ".png"
    image_def = doc.add_image_def(filename=rel, size_in_pixel=(px, py))
    img = msp.add_image(
        insert=(insert_x, Z_BOTTOM),
        size_in_units=(width_m, WORLD_H),
        image_def=image_def,
    )
    img.dxf.layer = layer
    return width_m


def annotate_elevation(name, title, insert_x, width_m):
    x0, x1 = insert_x, insert_x + width_m
    # title above
    msp.add_text(
        title, height=TXT_TITLE,
        dxfattribs={"layer": "ELEV-ANNOT"},
    ).set_placement((x0, 13.8))
    # grade line at z=0
    msp.add_lwpolyline([(x0, 0.0), (x1, 0.0)], dxfattribs={"layer": "ELEV-ANNOT"})
    msp.add_text(
        "+/- 0.00 (grade)", height=TXT_LABEL,
        dxfattribs={"layer": "ELEV-ANNOT"},
    ).set_placement((x0, 0.1))
    # eaves dashed line (if in CSV)
    h = heights.get(name)
    if h is not None:
        ez = h["eaves_z"]
        msp.add_lwpolyline(
            [(x0, ez), (x1, ez)],
            dxfattribs={"layer": "ELEV-ANNOT", "linetype": "DASHED"},
        )
        msp.add_text(
            f"egout ~ {ez:.2f} m", height=TXT_LABEL,
            dxfattribs={"layer": "ELEV-ANNOT"},
        ).set_placement((x0, ez + 0.1))
        # ridge note (foliage-contaminated)
        rz = h["ridge_z"]
        msp.add_text(
            f"faitage ~ {rz:.2f} m (feuillage)", height=TXT_TICK,
            dxfattribs={"layer": "ELEV-ANNOT"},
        ).set_placement((x0, 13.2))


def annotate_coupe(name, title, insert_x, width_m):
    x0, x1 = insert_x, insert_x + width_m
    msp.add_text(
        title, height=TXT_TITLE,
        dxfattribs={"layer": "ELEV-ANNOT"},
    ).set_placement((x0, 13.8))
    msp.add_lwpolyline([(x0, 0.0), (x1, 0.0)], dxfattribs={"layer": "ELEV-ANNOT"})
    msp.add_text(
        "+/- 0.00 (grade)", height=TXT_LABEL,
        dxfattribs={"layer": "ELEV-ANNOT"},
    ).set_placement((x0, 0.1))


# ------------- z-scale lives at far left; reserve space to its left of x=0
Z_SCALE_X = -3.0  # vertical scale line position
ELEV_START_X = 0.0

# ---- band 1: elevations
x = ELEV_START_X
for name, b, side in ELEV_ORDER:
    layer = f"ELEV-{b}-{side}"
    if layer not in doc.layers:
        doc.layers.add(layer)
    w = add_image(name, layer, x)
    title = f"{PRETTY[b]} - elevation {side}"
    annotate_elevation(name, title, x, w)
    placed.append((name, x, w, "elev"))
    x += w + GAP

# ---- band 2: coupes (continue to the right, after a clear band gap)
x = x - GAP + BAND_GAP
for name, b in COUPE_ORDER:
    layer = f"COUPE-{b}"
    if layer not in doc.layers:
        doc.layers.add(layer)
    w = add_image(name, layer, x)
    title = f"{PRETTY[b]} - coupe transversale"
    annotate_coupe(name, title, x, w)
    placed.append((name, x, w, "coupe"))
    x += w + GAP

# ---------------------------------------------------------------- step 5: z-scale
msp.add_line((Z_SCALE_X, Z_BOTTOM), (Z_SCALE_X, Z_TOP), dxfattribs={"layer": "Z-SCALE"})
z = -1
# ticks every 1 m from -1 .. 13 (include -1.5 bottom and 13 top range)
import math
zi = math.ceil(Z_BOTTOM)
while zi <= Z_TOP + 1e-9:
    msp.add_line((Z_SCALE_X - 0.25, zi), (Z_SCALE_X, zi), dxfattribs={"layer": "Z-SCALE"})
    msp.add_text(
        f"z = {zi:+.1f}", height=TXT_TICK,
        dxfattribs={"layer": "Z-SCALE"},
    ).set_placement((Z_SCALE_X - 2.6, zi - 0.15))
    zi += 1
# end caps at true window extremes
for zz in (Z_BOTTOM, Z_TOP):
    msp.add_line((Z_SCALE_X - 0.4, zz), (Z_SCALE_X, zz), dxfattribs={"layer": "Z-SCALE"})
msp.add_text(
    "ECHELLE Z (altitude site, m)", height=TXT_TICK,
    dxfattribs={"layer": "Z-SCALE", "rotation": 90},
).set_placement((Z_SCALE_X - 3.4, 0.0))

# ---------------------------------------------------------------- step 6: NOTES
note = (
    "FERME DU TEMPLE - elevations & coupes as-built NavVis (2026-06-04). "
    "Echelle vraie, 1 unite = 1 m, Y = altitude site z. "
    "Elevations: profondeur batiment projetee. "
    "Coupes transv2 = tranche 2.5 m. "
    "Hauteurs d'egout fiables; faitage contamine par la vegetation (lire sur l'image)."
)
mt = msp.add_mtext(note, dxfattribs={"layer": "NOTES", "char_height": 0.5})
mt.set_location((ELEV_START_X, Z_BOTTOM - 2.5))
mt.dxf.width = 60.0

doc.saveas(OUT_DXF)

# ---------------------------------------------------------------- report
print("SAVED:", OUT_DXF)
print("LAYOUT:")
for name, ox, w, kind in placed:
    print(f"  [{kind:5s}] {name:30s} x={ox:8.3f}  w={w:7.3f}  -> x_end={ox + w:8.3f}")
