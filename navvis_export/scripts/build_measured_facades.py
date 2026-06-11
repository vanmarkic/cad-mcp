#!/usr/bin/env python3
"""Measured façades & coupes from the building-ALIGNED set (NavVis point-cloud renders).

Outputs:
  navvis_export/ferme_du_temple_FACADES_COUPES_mesures.dxf   (m; image underlays + real
      DIMENSION entities: H égout / H faîtage / H max (coupes) / largeur structure;
      lignes de niveau TN/égout/faîtage; grille 1 m; échelle z partagée)
  navvis_export/facades_coupes_aligned/measured/<Building>_mesures.png  (annotated exports)
  navvis_export/facades_coupes_aligned/measured/CONTACT_mesures.png

Geometry source: facades_coupes_aligned/*.tiff (z-window -2..15 m shared) + aligned_specs.json
(width_m, ppm per image) + facade_heights_aligned.csv (TN/égout/faîtage per elevation, P60/P98).
Coupes get H max = P98 of top-of-content (computed here, same method as the CSV).

⚠ Caveats baked into labels:
  - Aile Ouest & Maison principale égout = végétation/plafond-inflated (README) -> "⚠".
  - ridge_z >= 14.99 -> clipped by the z-window -> ">=15.0 (tronqué)".
  - Maison principale TN (-2.71) is below the z-window -> line clamped, label says so.
All measurements are as-built scan measures (±2-5 cm cloud, P60/P98 statistics) — document de
travail, ne pas utiliser pour acte.
"""
import csv, glob, json, os
import numpy as np
from PIL import Image
import ezdxf

Image.MAX_IMAGE_PIXELS = None
EXP = "/Users/dragan/Documents/cad-mcp/navvis_export"
SRC = f"{EXP}/facades_coupes_aligned"
OUTD = f"{SRC}/measured"
os.makedirs(OUTD, exist_ok=True)
ZLO, ZHI = -2.0, 15.0
Hm = ZHI - ZLO

specs = {s["name"]: s for s in json.load(open(f"{SRC}/aligned_specs.json"))}
# VERIFIED heights (protocol v2 + human sign-off, see VERIF_hauteurs.md). The v1
# facade_heights_aligned.csv eaves values are RETRACTED — égout is not measurable from
# full-depth envelope renders; plateaus carry their signed-off semantics instead.
ver = {r["image"]: r for r in csv.DictReader(open(f"{SRC}/facade_heights_verified.csv"))}
ground_of = {b: float(ver[f"belev_{b}_long"]["ground_z"])
             for b in ("AileOuest", "AileSudEst", "Atelier", "Chapelle", "Maisonprincipale")}

ORDER = ["AileOuest", "AileSudEst", "Atelier", "Chapelle", "Maisonprincipale"]
def files_for(b):
    pre = [f"belev_{b}_long", f"belev_{b}_short"]
    if b == "AileSudEst":
        pre += ["bcoupe_AileSudEst_transv_arm1", "bcoupe_AileSudEst_transv_arm2"]
    else:
        pre += [f"bcoupe_{b}_transv", f"bcoupe_{b}_longit"]
    return [n for n in pre if os.path.exists(f"{SRC}/{n}.tiff")]

def content_stats(nm):
    """From the RGBA tiff: structure x-extent (m, image coords) + top-of-content P98 z."""
    a = np.array(Image.open(f"{SRC}/{nm}.tiff").convert("RGBA"))
    al = a[..., 3] > 30
    h, w = al.shape
    cols = np.where(al.any(axis=0))[0]
    x0_m = cols[0] / w * specs[nm]["width_m"]
    x1_m = (cols[-1] + 1) / w * specs[nm]["width_m"]
    tops = [ZHI - (np.argmax(al[:, c]) / h) * Hm for c in cols]
    return x0_m, x1_m, float(np.percentile(np.array(tops), 98))

stats = {nm: content_stats(nm) for b in ORDER for nm in files_for(b)}

# ---------------- DXF ----------------
doc = ezdxf.new("R2018", setup=True)
doc.header["$INSUNITS"] = 6
msp = doc.modelspace()
for lay, col in [("MESURES", 1), ("LIGNES-NIVEAU", 4), ("GRID-1M", 8),
                 ("Z-SCALE", 5), ("TITRES", 7), ("NOTES", 2)]:
    doc.layers.add(lay, color=col)
doc.layers.get("GRID-1M").off()   # dense; toggle on when needed
DIMOVR = {"dimtxt": 0.4, "dimasz": 0.25, "dimdec": 2, "dimexo": 0.15, "dimexe": 0.15}

def vdim(x, z0, z1, offset, text=None):
    d = msp.add_linear_dim(base=(x + offset, (z0 + z1) / 2), p1=(x, z0), p2=(x, z1),
                           angle=90, override=DIMOVR, dxfattribs={"layer": "MESURES"},
                           text=text if text else "<>")
    d.render()

def hdim(x0, x1, z, offset, text=None):
    d = msp.add_linear_dim(base=((x0 + x1) / 2, z + offset), p1=(x0, z), p2=(x1, z),
                           angle=0, override=DIMOVR, dxfattribs={"layer": "MESURES"},
                           text=text if text else "<>")
    d.render()

x = 0.0
GAPin, GAPbtw = 4.5, 10.0
positions = {}
for b in ORDER:
    for nm in files_for(b):
        s = specs[nm]
        Wm = s["width_m"]
        lay = ("COUPE-" if nm.startswith("bcoupe") else "ELEV-") + nm.split("_", 1)[1]
        if lay not in doc.layers:
            doc.layers.add(lay, color=5 if nm.startswith("bcoupe") else 7)
        idef = doc.add_image_def(filename=f"facades_coupes_aligned/underlay/{nm}.png",
                                 size_in_pixel=(s["w"], s["h"]))
        msp.add_image(insert=(x, ZLO), size_in_units=(Wm, Hm), image_def=idef,
                      dxfattribs={"layer": lay})
        positions[nm] = (x, Wm)

        msp.add_text(nm.replace("belev_", "ELEVATION ").replace("bcoupe_", "COUPE "),
                     height=0.55, dxfattribs={"layer": "TITRES"}).set_placement((x, ZHI + 0.6))
        # 1 m grid (off by default)
        for z in range(int(ZLO), int(ZHI) + 1):
            msp.add_line((x, z), (x + Wm, z), dxfattribs={"layer": "GRID-1M"})

        g = ground_of[nm.split("_")[1] if "_" in nm else nm]
        gln = max(g, ZLO)
        msp.add_lwpolyline([(x, gln), (x + Wm, gln)],
                           dxfattribs={"layer": "LIGNES-NIVEAU", "const_width": 0.06})
        msp.add_text(f"TN {g:.2f}" + (" (sous fenêtre)" if g < ZLO else ""), height=0.35,
                     dxfattribs={"layer": "LIGNES-NIVEAU"}).set_placement((x + 0.2, gln + 0.15))

        x0c, x1c, _ = stats[nm]
        # structure width (content extent)
        hdim(x + x0c, x + x1c, ZLO, -1.2)

        v = ver[nm]
        rz, Hr = float(v["ridge_z"]), float(v["H_ridge"])
        clip = v["ridge_clipped"] == "True"
        tag = "faîtage" if v["kind"] == "elev" else "sommet"
        msp.add_lwpolyline([(x, rz), (x + Wm, rz)], dxfattribs={"layer": "LIGNES-NIVEAU"})
        msp.add_text(f"{tag} {rz:.2f}" + (" ≥(tronqué fenêtre z)" if clip else ""), height=0.35,
                     dxfattribs={"layer": "LIGNES-NIVEAU"}).set_placement((x + 0.2, rz + 0.15))
        vdim(x + Wm, g, rz, +1.4,
             text=(f"H {tag} " + ("≥" if clip else "") + f"{Hr:.2f}"))
        if v["plateau_z"]:
            pz = float(v["plateau_z"])
            msp.add_lwpolyline([(x, pz), (x + Wm, pz)], dxfattribs={"layer": "LIGNES-NIVEAU"})
            msp.add_text(f"{pz:.2f} — {v['plateau_semantique']}", height=0.32,
                         dxfattribs={"layer": "LIGNES-NIVEAU"}).set_placement((x + 0.2, pz - 0.5))
            vdim(x, g, pz, -1.4, text=f"H {pz - g:.2f}")
        # égout: deliberately ABSENT — not measurable from full-depth envelopes
        # (VERIF_hauteurs.md, sign-off 2026-06-11). v1 values retracted.
        x += Wm + GAPin
    x += GAPbtw - GAPin

# shared z scale
zx = -4.0
msp.add_line((zx, ZLO), (zx, ZHI), dxfattribs={"layer": "Z-SCALE"})
for z in range(int(ZLO), int(ZHI) + 1):
    msp.add_line((zx - 0.3, z), (zx, z), dxfattribs={"layer": "Z-SCALE"})
    msp.add_text(f"{z:+d}", height=0.3, dxfattribs={"layer": "Z-SCALE"}).set_placement((zx - 1.5, z - 0.15))

msp.add_mtext(
    "FERME DU TEMPLE — FACADES & COUPES MESUREES (as-built NavVis, alignées par bâtiment) — rev. C\\P"
    "1 unité = 1 m; Y = altitude z site NavVis (fenêtre −2…+15). Coupes = tranche 2.5 m.\\P"
    "Mesures VERIFIEES (protocole v2 + sign-off, VERIF_hauteurs.md): faîtage/sommet = max du profil "
    "de tops persistants lissé 0.5 m; plateaux secondaires identifiés visuellement; TN = z min "
    "bâtiment (site model); largeur = étendue de structure dans l'image.\\P"
    "EGOUT ABSENT PAR PROTOCOLE: rendus pleine profondeur => silhouette = enveloppe de toiture; "
    "l'égout n'y est pas mesurable (valeurs v1 retirées). Faîtage ≥15 = tronqué par la fenêtre z "
    "(vraie valeur supérieure). Document de travail (2026-06-11) — ne pas utiliser pour acte.",
    dxfattribs={"layer": "NOTES", "char_height": 0.5}).set_location((zx, ZLO - 3.2), attachment_point=1)

out = f"{EXP}/ferme_du_temple_FACADES_COUPES_mesures.dxf"
doc.saveas(out)
aud = ezdxf.readfile(out).audit()
print("DXF:", out, "| audit errors:", len(aud.errors))

# ---------------- PNG exports ----------------
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

def annotate(ax, nm):
    s = specs[nm]
    Wm = s["width_m"]
    img = Image.open(f"{SRC}/underlay/{nm}.png")
    ax.imshow(np.asarray(img), extent=[0, Wm, ZLO, ZHI], aspect="equal")
    b = nm.split("_")[1]
    g = ground_of[b]
    x0c, x1c, top98 = stats[nm]
    for z in range(int(ZLO), int(ZHI) + 1):
        ax.axhline(z, color="0.85", lw=0.4, zorder=1)
    gln = max(g, ZLO)
    ax.axhline(gln, color="saddlebrown", lw=1.6)
    ax.annotate(f"TN {g:.2f}" + (" (sous fenêtre)" if g < ZLO else ""), (0.3, gln + 0.15),
                color="saddlebrown", fontsize=7)
    # width arrow
    ax.annotate("", (x0c, ZLO + 0.5), (x1c, ZLO + 0.5), arrowprops=dict(arrowstyle="<->", color="red"))
    ax.annotate(f"{x1c - x0c:.2f} m", ((x0c + x1c) / 2, ZLO + 0.7), color="red", fontsize=8,
                ha="center", fontweight="bold")
    v = ver[nm]
    rz, Hr = float(v["ridge_z"]), float(v["H_ridge"])
    clip = v["ridge_clipped"] == "True"
    tag = "faîtage" if v["kind"] == "elev" else "sommet"
    ax.axhline(rz, color="navy", lw=1.0, ls="--")
    ax.annotate(f"{tag} {rz:.2f}" + (" ≥tronqué" if clip else ""), (0.3, rz + 0.15),
                color="navy", fontsize=7)
    ax.annotate("", (x1c, g), (x1c, rz), arrowprops=dict(arrowstyle="<->", color="red", lw=1.2))
    ax.annotate(f"H {tag} " + ("≥" if clip else "") + f"{Hr:.2f}", (x1c + 0.3, (g + rz) / 2),
                color="red", fontsize=8, rotation=90, va="center", fontweight="bold")
    if v["plateau_z"]:
        pz = float(v["plateau_z"])
        ax.axhline(pz, color="teal", lw=1.0, ls="--")
        ax.annotate(f"{pz:.2f} — {v['plateau_semantique']}", (0.3, pz - 0.45),
                    color="teal", fontsize=6.5)
        ax.annotate("", (x0c, g), (x0c, pz), arrowprops=dict(arrowstyle="<->", color="red", lw=1.0))
        ax.annotate(f"H {pz - g:.2f}", (x0c + 0.3, (g + pz) / 2), color="red", fontsize=7,
                    rotation=90, va="center")
    # égout: absent by design — non measurable from envelope renders (VERIF_hauteurs.md)
    ax.set_xlim(-1, Wm + 2)
    ax.set_ylim(ZLO - 1.4, ZHI + 1)
    ax.set_title(nm.replace("belev_", "ELEVATION ").replace("bcoupe_", "COUPE "), fontsize=9)
    ax.set_ylabel("z site (m)", fontsize=7)
    ax.tick_params(labelsize=7)

outs = []
for bld in ORDER:
    nms = files_for(bld)
    fig, axes = plt.subplots(2, 2, figsize=(17, 11))
    for ax, nm in zip(axes.flat, nms):
        annotate(ax, nm)
    for ax in axes.flat[len(nms):]:
        ax.axis("off")
    fig.suptitle(f"Ferme du Temple — {bld} — façades & coupes MESURÉES (as-built NavVis, "
                 f"alignées) — doc. de travail 2026-06-11, ne pas utiliser pour acte", fontsize=11)
    p = f"{OUTD}/{bld}_mesures.png"
    fig.savefig(p, dpi=130, bbox_inches="tight")
    plt.close(fig)
    outs.append(p)
    print("PNG:", p)

# contact sheet
ims = [Image.open(p).convert("RGB") for p in outs]
tw = 1400
ths = [int(im.size[1] * tw / im.size[0]) for im in ims]
sheet = Image.new("RGB", (tw, sum(ths)), (255, 255, 255))
y = 0
for im, th in zip(ims, ths):
    sheet.paste(im.resize((tw, th)), (0, y))
    y += th
sheet.save(f"{OUTD}/CONTACT_mesures.png")
print("PNG:", f"{OUTD}/CONTACT_mesures.png")
