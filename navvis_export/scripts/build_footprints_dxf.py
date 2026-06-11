#!/usr/bin/env python3
"""Build a DXF of the Ferme du Temple building footprints + measured areas + storey
levels, from NavVis IVION site_model. Vector, exact, georeferenced (EPSG:8370).

Outputs (in navvis_export/):
  ferme_du_temple_footprints_local_m.dxf   (local site coords, METERS)
  ferme_du_temple_footprints_local_cm.dxf  (local site coords, CENTIMETERS — for 260608 overlay)
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXPORT = os.path.dirname(HERE)
api = json.load(open(os.path.join(EXPORT, "raw", "api_geometry.json")))
sm = api["site_model"]["body"]
aff = api["affine_ref_sys"]["body"]
site_aff = next(a for a in aff if a["type"] == "SITE")

import ezdxf
from ezdxf.enums import TextEntityAlignment

LAYERS = {
    "NAVVIS-FOOTPRINT":   {"color": 5},   # blue  - building footprint polylines
    "NAVVIS-AREA-LABEL":  {"color": 3},   # green - area + name
    "NAVVIS-FLOOR-INFO":  {"color": 2},   # yellow- storey levels / heights
    "NAVVIS-NOTES":       {"color": 8},   # grey  - provenance note
}

def build(scale, insunits, suffix, unit_label):
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = insunits
    msp = doc.modelspace()
    for name, attr in LAYERS.items():
        doc.layers.add(name, color=attr["color"])

    th = 0.30 * scale          # area-label text height
    th_small = 0.18 * scale    # floor-info text height

    for b in sm:
        ring = b["scs_polygon"]["coordinates"][0]
        pts = [(x * scale, y * scale) for x, y in ring]
        # footprint (closed)
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "NAVVIS-FOOTPRINT"})
        # centroid for labels
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        # name + measured footprint area
        msp.add_mtext(
            f"{b['name']}\\P{b['area']:.2f} m² (emprise)",
            dxfattribs={"layer": "NAVVIS-AREA-LABEL", "char_height": th},
        ).set_location((cx, cy), attachment_point=5)
        # storey levels (base elevation of each floor; top z_max is open-to-sky, flagged)
        floors = b.get("children") or []
        lines = [f"{b['name']} — niveaux (z, m, local):"]
        for f in floors:
            zmin, zmax = f.get("scs_z_min"), f.get("scs_z_max")
            lines.append(f"  niveau {f['name']:>2}: base z={zmin:.2f}" if zmin is not None else f"  niveau {f['name']}")
        txt = "\\P".join(lines)
        msp.add_mtext(txt, dxfattribs={"layer": "NAVVIS-FLOOR-INFO", "char_height": th_small}) \
           .set_location((cx, cy - 2.0 * scale), attachment_point=5)

    note = (
        "FERME DU TEMPLE — emprises bâtiments d'après scan NavVis IVION (ImmoPass, dossier 12039, relevé 2026-06-04).\\P"
        "Source: site_model /api/site/3186889630268293. Coordonnees locales du site, %s.\\P"
        "Georef EPSG:8370 (Lambert 2008): origine site E=%.3f N=%.3f Z=%.3f.\\P"
        "Aires = emprises mesurees (footprint), NON aires de plancher. Plans interieurs/facades/coupe: voir phase point-cloud."
    ) % (unit_label, site_aff["tx"], site_aff["ty"], site_aff["tz"])
    msp.add_mtext(note, dxfattribs={"layer": "NAVVIS-NOTES", "char_height": th_small}) \
       .set_location((0, 0), attachment_point=5)

    out = os.path.join(EXPORT, f"ferme_du_temple_footprints_local_{suffix}.dxf")
    doc.saveas(out)
    print("wrote", out)

build(1.0, 6, "m", "metres")     # meters
build(100.0, 5, "cm", "centimetres")  # centimeters (match 260608 DWG units)
print("buildings:", [b["name"] for b in sm])
