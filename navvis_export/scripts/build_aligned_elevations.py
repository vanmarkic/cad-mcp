#!/usr/bin/env python3
"""Building-ALIGNED elevations & coupes: composite underlays, recompute façade heights,
build the elevations DXF (z-window -2..15 = 17 m, shared datum), and a contact sheet.
These supersede the cardinal-axis set (boxes were rotated to each building's wall angle)."""
import json, os, glob, csv
import numpy as np
from PIL import Image, ImageDraw
import ezdxf
Image.MAX_IMAGE_PIXELS=None

EXP="/Users/dragan/Documents/cad-mcp/navvis_export"
SRC=f"{EXP}/facades_coupes_aligned"; UND=f"{SRC}/underlay"; os.makedirs(UND,exist_ok=True)
ZLO,ZHI=-2.0,15.0; Hm=ZHI-ZLO
specs={s["name"]:s for s in json.load(open("/tmp/cadwork/aligned_specs.json"))}
api=json.load(open(f"{EXP}/raw/api_geometry.json")); sm=api["site_model"]["body"]
ground={b["name"].replace(" ","").replace("-",""):min([f["scs_z_min"] for f in (b.get("children") or []) if f.get("scs_z_min") is not None]) for b in sm}

# 1) underlays (full-res, white bg)
for tif in sorted(glob.glob(f"{SRC}/*.tiff")):
    im=Image.open(tif).convert("RGBA"); bg=Image.new("RGBA",im.size,(255,255,255,255))
    Image.alpha_composite(bg,im).convert("RGB").save(f"{UND}/{os.path.basename(tif).replace('.tiff','.png')}")

# 2) façade heights from the true elevations (belev_*)
def bld_of(n): return n.replace("belev_","").rsplit("_",1)[0]
rows=[]
for tif in sorted(glob.glob(f"{SRC}/belev_*.tiff")):
    nm=os.path.basename(tif).replace(".tiff",""); g=ground.get(bld_of(nm),0.0)
    a=np.array(Image.open(tif).convert("RGBA")); h=a.shape[0]; al=a[...,3]>30
    zs=[ZHI-(np.argmax(al[:,c])/h)*Hm for c in range(al.shape[1]) if al[:,c].any()]
    if not zs: continue
    zs=np.array(zs); eaves=np.percentile(zs,60); ridge=np.percentile(zs,98)
    rows.append(dict(elevation=nm,ground_z=round(g,2),eaves_z=round(eaves,2),ridge_z=round(ridge,2),
                     H_eaves=round(eaves-g,2),H_ridge=round(ridge-g,2)))
with open(f"{SRC}/facade_heights_aligned.csv","w",newline="") as fp:
    w=csv.DictWriter(fp,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
eaves={r["elevation"]:r for r in rows}

# 3) DXF (overwrite the main elevations file with the corrected aligned set)
doc=ezdxf.new("R2018"); doc.header["$INSUNITS"]=6; msp=doc.modelspace()
order=["AileOuest","AileSudEst","Atelier","Chapelle","Maisonprincipale"]
def files_for(b):
    pre=[f"belev_{b}_long",f"belev_{b}_short"]
    if b=="AileSudEst": pre+=["bcoupe_AileSudEst_transv_arm1","bcoupe_AileSudEst_transv_arm2"]
    else: pre+=[f"bcoupe_{b}_transv",f"bcoupe_{b}_longit"]
    return pre
x=0.0; GAPin=3.0; GAPbtw=8.0; layout=[]
for b in order:
    for nm in files_for(b):
        tif=f"{SRC}/{nm}.tiff";
        if not os.path.exists(tif): continue
        im=Image.open(tif); pw,ph=im.size; Wm=specs[nm]["width_m"]
        lay=("COUPE-" if nm.startswith("bcoupe") else "ELEV-")+nm.replace("bcoupe_","").replace("belev_","")
        doc.layers.add(lay,color=(5 if nm.startswith('bcoupe') else 7)) if lay not in doc.layers else None
        idef=doc.add_image_def(filename=f"facades_coupes_aligned/underlay/{nm}.png", size_in_pixel=(pw,ph))
        msp.add_image(insert=(x,ZLO), size_in_units=(Wm,Hm), image_def=idef, dxfattribs={"layer":lay})
        # title + grade + eaves
        for L in ("ELEV-ANNOT","Z-SCALE","NOTES"):
            if L not in doc.layers: doc.layers.add(L,color={"ELEV-ANNOT":1,"Z-SCALE":5,"NOTES":2}[L])
        msp.add_text(nm.replace("belev_","").replace("bcoupe_",""), height=0.45,
                     dxfattribs={"layer":"ELEV-ANNOT"}).set_placement((x,ZHI+0.4))
        msp.add_lwpolyline([(x,0),(x+Wm,0)], dxfattribs={"layer":"ELEV-ANNOT"})  # grade z=0
        if nm in eaves:
            ez=eaves[nm]["eaves_z"]
            msp.add_lwpolyline([(x,ez),(x+Wm,ez)], dxfattribs={"layer":"ELEV-ANNOT"})
            msp.add_text(f"egout~{ez:.1f}m", height=0.35, dxfattribs={"layer":"ELEV-ANNOT"}).set_placement((x,ez+0.1))
        layout.append((nm,round(x,2),round(Wm,2)))
        x+=Wm+GAPin
    x+=GAPbtw-GAPin
# shared z-scale at far left
zx=-3.0
msp.add_line((zx,ZLO),(zx,ZHI),dxfattribs={"layer":"Z-SCALE"})
for z in range(int(ZLO),int(ZHI)+1):
    msp.add_line((zx-0.3,z),(zx,z),dxfattribs={"layer":"Z-SCALE"})
    msp.add_text(f"{z:+d}",height=0.3,dxfattribs={"layer":"Z-SCALE"}).set_placement((zx-1.6,z-0.15))
msp.add_mtext("FERME DU TEMPLE — elevations & coupes as-built NavVis, ALIGNEES sur les axes de chaque "
   "batiment (orthographiques vraies). 1 unite = 1 m, Y = altitude site z (-2..15). Coupes = tranche 2.5 m. "
   "Hauteurs d'egout fiables; faitage = lire sur image (vegetation).",
   dxfattribs={"layer":"NOTES","char_height":0.5}).set_location((zx,ZLO-2),attachment_point=1)
out=f"{EXP}/ferme_du_temple_ELEVATIONS_m.dxf"; doc.saveas(out)

# 4) contact sheet
def sheet(paths,cols,outp):
    ims=[Image.open(p).convert("RGB") for p in paths]; tw=480
    th=[int(im.size[1]*tw/im.size[0]) for im in ims]; rows=(len(ims)+cols-1)//cols
    rh=[max(th[r*cols:(r+1)*cols] or [0]) for r in range(rows)]
    sh=Image.new("RGB",(cols*tw,sum(rh)+30*rows),(255,255,255)); d=ImageDraw.Draw(sh); y=0
    for r in range(rows):
        xx=0
        for c in range(cols):
            i=r*cols+c
            if i>=len(ims): break
            d.text((xx+4,y+2),os.path.basename(paths[i])[:-4],fill=(0,0,0))
            sh.paste(ims[i].resize((tw,th[i])),(xx,y+26)); xx+=tw
        y+=rh[r]+30
    sh.save(outp)
prev=lambda pat: sorted(glob.glob(f"{SRC}/preview/{pat}.png"))
sheet(prev("belev_*"),2,f"{SRC}/CONTACT_facades_aligned.png")
sheet(prev("bcoupe_*"),2,f"{SRC}/CONTACT_coupes_aligned.png")

from collections import Counter
d2=ezdxf.readfile(out); print("DXF entities:",dict(Counter(e.dxftype() for e in d2.modelspace())))
print("images placed:",len(layout));
print("facade heights (H_eaves, m):", {r['elevation'].replace('belev_',''):r['H_eaves'] for r in rows})
print("wrote",out)
