#!/usr/bin/env python3
"""Package the OUTWARD exterior façades (facades_exterieures/belev_ext_*.tiff) into:
  * underlay/<name>.png      — full-res white-bg rasters (CAD-friendly)
  * ferme_du_temple_FACADES_EXT_m.dxf — images placed at TRUE z-scale (1 unit = 1 m,
    Y = NavVis site altitude z), side by side per building, with grade + z-scale + title.
  * facades_exterieures.pdf  — true-scale plates, one façade per page, cover/disclaimer.
Run from anywhere; paths are absolute to the repo."""
import json, os, glob, zipfile
import numpy as np
from PIL import Image
import ezdxf
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
Image.MAX_IMAGE_PIXELS=None

EXP="/Users/dragan/Documents/cad-mcp/navvis_export"
SRC=f"{EXP}/facades_exterieures"; UND=f"{SRC}/underlay"; os.makedirs(UND, exist_ok=True)
specs={s["name"]:s for s in json.load(open(f"{SRC}/facades_ext_specs.json"))}

# only the shipped façades (TIFF present), grouped by building, with FR side labels
SIDE_FR={"S":"sud","E":"est","W":"ouest","N":"nord","SE":"sud-est","SW":"sud-ouest","NE":"nord-est","NW":"nord-ouest"}
ORDER=["belev_ext_AileOuest_W2","belev_ext_AileOuest_S2","belev_ext_AileOuest_N2",
       "belev_ext_AileSud-Est_S","belev_ext_AileSud-Est_E","belev_ext_Atelier_E2","belev_ext_Chapelle_E"]
items=[n for n in ORDER if os.path.exists(f"{SRC}/{n}.tiff")]

def fr_title(s):
    return f"{s['building']} — façade {SIDE_FR.get(s['side'],s['side'])}"

# 1) underlays (white bg)
for n in items:
    im=Image.open(f"{SRC}/{n}.tiff").convert("RGBA")
    bg=Image.new("RGBA", im.size, (255,255,255,255))
    Image.alpha_composite(bg, im).convert("RGB").save(f"{UND}/{n}.png")

# 2) DXF — true z-scale strip
doc=ezdxf.new("R2018"); doc.header["$INSUNITS"]=6; msp=doc.modelspace()
for L,c in (("ELEV-EXT",7),("ANNOT",1),("Z-SCALE",5),("NOTES",2)):
    if L not in doc.layers: doc.layers.add(L, color=c)
x=0.0; GAP=3.0; zlo_all=999; zhi_all=-999
for n in items:
    s=specs[n]; W=s["w"]; H=s["h"]; Wm=s["width_m"]; zlo=s["z_min"]; zhi=s["z_max"]; Hm=zhi-zlo
    zlo_all=min(zlo_all,zlo); zhi_all=max(zhi_all,zhi)
    idef=doc.add_image_def(filename=f"underlay/{n}.png", size_in_pixel=(W,H))
    msp.add_image(insert=(x,zlo), size_in_units=(Wm,Hm), image_def=idef, dxfattribs={"layer":"ELEV-EXT"})
    msp.add_text(fr_title(s), height=0.45, dxfattribs={"layer":"ANNOT"}).set_placement((x, zhi+0.5))
    msp.add_text(f"{Wm:.1f} m", height=0.30, dxfattribs={"layer":"ANNOT"}).set_placement((x, zlo-0.8))
    msp.add_lwpolyline([(x,0),(x+Wm,0)], dxfattribs={"layer":"ANNOT"})            # grade z=0
    x+=Wm+GAP
# shared z-scale at far left
zx=-3.0
msp.add_line((zx,zlo_all),(zx,zhi_all), dxfattribs={"layer":"Z-SCALE"})
for z in range(int(np.floor(zlo_all)), int(np.ceil(zhi_all))+1):
    msp.add_line((zx-0.3,z),(zx,z), dxfattribs={"layer":"Z-SCALE"})
    msp.add_text(f"{z:+d}", height=0.3, dxfattribs={"layer":"Z-SCALE"}).set_placement((zx-1.7,z-0.15))
msp.add_mtext(
 "FERME DU TEMPLE — FACADES EXTERIEURES (orthographiques, vues de l'exterieur vers l'interieur). "
 "Rendu local du nuage de points NavVis (POTREE2, 63,7 M pts). 1 unite = 1 m, Y = altitude site z. "
 "Tranche fine ~2 m a la surface du mur exterieur. SCAN INTERIEUR : couverture des faces exterieures "
 "PARTIELLE (faces cour/interieur mieux captees). Ruine sans toiture, vegetation. Indicatif, "
 "non destine a l'acte. Vegetation non retouchee.",
 dxfattribs={"layer":"NOTES","char_height":0.5}).set_location((zx, zlo_all-2.5), attachment_point=1)
dxf_path=f"{SRC}/ferme_du_temple_FACADES_EXT_m.dxf"; doc.saveas(dxf_path)

# 2b) zip DXF + underlays (portable image-DXF)
zip_path=f"{SRC}/facades_exterieures_dxf.zip"
with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED) as z:
    z.write(dxf_path, "ferme_du_temple_FACADES_EXT_m.dxf")
    for n in items: z.write(f"{UND}/{n}.png", f"underlay/{n}.png")

# 3) PDF — true-scale plates
pdf_path=f"{SRC}/facades_exterieures.pdf"
with PdfPages(pdf_path) as pdf:
    fig=plt.figure(figsize=(11.7,8.3)); fig.text(0.5,0.74,"Ferme du Temple",ha="center",size=26,weight="bold")
    fig.text(0.5,0.67,"Façades extérieures — relevé as-built NavVis",ha="center",size=15)
    fig.text(0.5,0.61,"orthographiques, vues de l'extérieur vers l'intérieur",ha="center",size=12,style="italic")
    fig.text(0.12,0.45,
     "Rendu orthographique local du nuage de points NavVis (POTREE2, 63,7 M points, scan ImmoPass\n"
     "du 04/06/2026). Chaque planche est une tranche fine prise à la surface du mur extérieur,\n"
     "vue de l'extérieur (1 cm/px ; 1 unité = 1 m ; Y = altitude site z).\n\n"
     "⚠ Le scan est un relevé INTÉRIEUR / cour : la couverture des vraies faces extérieures est\n"
     "PARTIELLE (les faces côté cour sont mieux captées). Le site est une ruine sans toiture,\n"
     "envahie par la végétation. Document INDICATIF — non destiné à l'acte. Rien n'est retouché :\n"
     "les zones vides/floues correspondent à des surfaces non atteintes par le scan.\n\n"
     "Couverture par façade : Aile Sud-Est sud & est, Chapelle est = exploitables ; Aile Ouest\n"
     "ouest/sud/nord, Atelier est = partielles (structure intérieure visible).",
     size=10.5, va="top", family="DejaVu Sans")
    fig.text(0.12,0.06,"2026-06-12 · navvis_export/facades_exterieures/ · non contractuel",size=8,color="gray")
    pdf.savefig(fig); plt.close(fig)
    for n in items:
        s=specs[n]; im=Image.open(f"{SRC}/{n}.tiff").convert("RGBA")
        bg=Image.new("RGBA",im.size,(255,255,255,255)); rgb=np.asarray(Image.alpha_composite(bg,im).convert("RGB"))
        Wm=s["width_m"]; zlo=s["z_min"]; zhi=s["z_max"]
        page_w=11.7; page_h=max(4.5, min(8.3, page_w*(zhi-zlo)/Wm*1.15+1.4))
        fig=plt.figure(figsize=(page_w,page_h))
        ax=fig.add_axes([0.07,0.12,0.90,0.78])
        ax.imshow(rgb, extent=[0,Wm,zlo,zhi], aspect="equal", interpolation="nearest")
        ax.set_xlabel("largeur (m)"); ax.set_ylabel("altitude site z (m)")
        ax.set_title(f"{fr_title(s)}   ·   {Wm:.1f} m   ·   couverture {int(s['pixel_fill']*100)} %", size=12)
        ax.grid(True, color="0.85", lw=0.4)
        pdf.savefig(fig); plt.close(fig)

print("DXF :", dxf_path)
print("ZIP :", zip_path, f"({os.path.getsize(zip_path)//1024} KB)")
print("PDF :", pdf_path, f"({os.path.getsize(pdf_path)//1024} KB)")
print("underlays:", len(items), "façades")
