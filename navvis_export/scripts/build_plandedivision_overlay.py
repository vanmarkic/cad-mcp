#!/usr/bin/env python3
"""Overlay the architect PLAN DE DIVISION (lots L1-L13) on the NavVis orthophoto — NO FITTING.

Intent (per client request): EXPOSE the divergence between the architect design (projet) and the
as-built ruin (existant). We therefore do NOT fit/snap/scale the design to the scan. Registration
is TRANSLATION ONLY (rotation 0 deg, scale 1:1): a single gross XY offset that brings the architect
CAD origin onto the NavVis-local frame. Every rotational / shape / wall-position divergence then
remains visible. Design walls are coloured by distance to the as-built linework.

Sources
  - plan de division : plan_de_division_2026_06_12/260612_plansdedivision_archi-dwg/{N +0,N +1}.dwg
                       (architect, Vectorworks, units = cm, near-Lambert CAD frame; N+0 & N+1 share
                        the identical frame -> ONE translation serves both floors)
  - orthophoto       : navvis_export/orthophotos/underlay/plan_*_{0,1}.png (+ .pgw)  (NavVis-local m)
  - as-built linework: navvis_export/ferme_du_temple_OVERLAY_6190_navvis.dxf
                       layers NAVVIS-MURS-{0,1} (3D scan walls) + 6190-PLAN-{0,1} (géomètre Albert)

Registration = translation only, fixed from the GROUND floor (most complete geometry, best
design/as-built agreement), reused for +1. nav = xy_arch_cm/100 + T.  NO rotation, NO scale, NO ICP.

Outputs (reference/): plandedivision_vs_navvis_N{0,1}.{png,pdf} + ..._meta.json
Document de travail — ne pas utiliser pour acte (valeurs à confirmer géomètre/architecte).

Regenerate:  ./.venv/bin/python navvis_export/scripts/build_plandedivision_overlay.py
"""
import os, re, glob, json, math, subprocess, tempfile
import numpy as np
import ezdxf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.patches import Polygon as MplPoly
from PIL import Image
from scipy.spatial import cKDTree

ROOT = "/Users/dragan/Documents/cad-mcp"
OVL  = f"{ROOT}/navvis_export/ferme_du_temple_OVERLAY_6190_navvis.dxf"
PD_DIR = f"{ROOT}/plan_de_division_2026_06_12/260612_plansdedivision_archi-dwg"
ARCH_WALL = {"Bestaand-4 massa", "_Nieuw-4 massa", "Batiment"}

# ---- convert canonical DWGs -> DXF (libredwg) into a temp dir ----
TMP = tempfile.mkdtemp(prefix="pd_overlay_")
PD = {}
for lvl, name in (("0", "N +0.dwg"), ("1", "N +1.dwg")):
    dxf = os.path.join(TMP, f"PD_N{lvl}.dxf")
    subprocess.run(["dwg2dxf", "-o", dxf, os.path.join(PD_DIR, name)],
                   check=True, capture_output=True)
    PD[lvl] = dxf

# ---------- geometry helpers ----------
def dxf_segpts(path, layers, scale=1.0, dens=0.4):
    doc = ezdxf.readfile(path); pts=[]
    def seg(p1,p2):
        p1=np.array(p1,float)*scale; p2=np.array(p2,float)*scale
        d=np.hypot(*(p2-p1)); n=max(1,int(d/dens))
        for i in range(n+1): pts.append(p1+(p2-p1)*i/n)
    for e in doc.modelspace():
        if e.dxf.layer not in layers: continue
        t=e.dxftype()
        if t=="LINE": seg((e.dxf.start.x,e.dxf.start.y),(e.dxf.end.x,e.dxf.end.y))
        elif t=="LWPOLYLINE":
            v=[(p[0],p[1]) for p in e.get_points("xy")]
            if e.closed and len(v)>1: v+=[v[0]]
            for i in range(len(v)-1): seg(v[i],v[i+1])
        elif t=="POLYLINE":
            v=[(p.dxf.location.x,p.dxf.location.y) for p in e.vertices]
            if len(v)>1:
                if getattr(e,"is_closed",False): v+=[v[0]]
                for i in range(len(v)-1): seg(v[i],v[i+1])
    return np.array(pts) if pts else np.empty((0,2))

def dxf_wall_segments(path, layers, scale=1.0):
    doc=ezdxf.readfile(path); segs=[]
    for e in doc.modelspace():
        if e.dxf.layer not in layers: continue
        t=e.dxftype()
        if t=="LINE":
            segs.append([(e.dxf.start.x*scale,e.dxf.start.y*scale),(e.dxf.end.x*scale,e.dxf.end.y*scale)])
        elif t=="LWPOLYLINE":
            v=[(p[0]*scale,p[1]*scale) for p in e.get_points("xy")]
            if e.closed and len(v)>1: v+=[v[0]]
            segs += [[v[i],v[i+1]] for i in range(len(v)-1)]
        elif t=="POLYLINE":
            v=[(p.dxf.location.x*scale,p.dxf.location.y*scale) for p in e.vertices]
            if len(v)>1:
                if getattr(e,"is_closed",False): v+=[v[0]]
                segs += [[v[i],v[i+1]] for i in range(len(v)-1)]
    return segs

def lot_polys_and_labels(path):
    doc=ezdxf.readfile(path); msp=doc.modelspace(); polys=[]
    for e in msp.query("LWPOLYLINE POLYLINE"):
        if e.dxf.layer!="Oppervlakte-netto": continue
        if e.dxftype()=="LWPOLYLINE": v=[(p[0],p[1]) for p in e.get_points("xy")]
        else: v=[(p.dxf.location.x,p.dxf.location.y) for p in e.vertices]
        if len(v)<3: continue
        a=0.0
        for i in range(len(v)):
            x1,y1=v[i]; x2,y2=v[(i+1)%len(v)]; a+=x1*y2-x2*y1
        polys.append({"v":v,"area_m2":abs(a)/2.0*1e-4,  # cm vertices -> m²
                      "c":(sum(p[0] for p in v)/len(v),sum(p[1] for p in v)/len(v))})
    labels=[]
    for e in msp.query("MTEXT TEXT"):
        raw=e.text if e.dxftype()=="MTEXT" else e.dxf.text
        p=re.sub(r"\\[A-Za-z][^;]*;","",raw); p=re.sub(r"[{}]","",p).replace("\\P"," ").strip()
        m=re.match(r"^L(\d+)\b",p)
        if m: labels.append({"L":int(m.group(1)),"pos":(e.dxf.insert.x,e.dxf.insert.y)})
    for lb in labels:
        best=min(polys,key=lambda q:math.hypot(q["c"][0]-lb["pos"][0],q["c"][1]-lb["pos"][1]))
        lb["poly"]=best; best["L"]=lb["L"]
    return polys, labels

def pgw_extent(png):
    a,_,_,d,cx,cy=[float(l) for l in open(png[:-4]+".pgw")]
    im=Image.open(png); w,h=im.size
    return im,[cx-a/2, cx+a*w-a/2, cy+d*h+abs(d)/2, cy+abs(d)/2]

# ---------- as-built reference (already NavVis-local m) ----------
NAV = dxf_segpts(OVL, {"NAVVIS-MURS-0","NAVVIS-MURS-1","6190-PLAN-0","6190-PLAN-1"})
NAVtree = cKDTree(NAV)
LOT_COLORS = plt.get_cmap("tab20")

def register_translation():
    """ONE architect-frame -> NavVis-local translation (rot 0, scale 1), fixed from the GROUND
    floor. Pure gross XY centring (minimise median nearest-as-built distance over dx,dy); NO
    rotation/scale/shape fit, so divergence is preserved."""
    archW = dxf_segpts(PD["0"], ARCH_WALL, scale=0.01)
    t0 = np.median(NAV,0) - np.median(archW,0)
    med_nn = lambda t: np.median(NAVtree.query(archW + t)[0])
    best=(med_nn(t0), t0)
    for ddx in np.arange(-6,6.01,0.25):
        for ddy in np.arange(-6,6.01,0.25):
            t=t0+[ddx,ddy]; m=med_nn(t)
            if m<best[0]: best=(m,t)
    return best[1]

def render(lvl, T):
    pd = PD[lvl]
    archW = dxf_segpts(pd, ARCH_WALL, scale=0.01)
    dW = NAVtree.query(archW + T)[0]
    div = {"median_m":float(np.median(dW)),"p90_m":float(np.percentile(dW,90)),
           "max_m":float(dW.max()),"frac_gt_0.3m":float((dW>0.3).mean())}
    polys,labels = lot_polys_and_labels(pd)
    archSegs = dxf_wall_segments(pd, ARCH_WALL, scale=0.01)
    xfc = lambda P: (np.asarray(P,float)*0.01)+T   # cm (architect) -> NavVis-local m

    fig,ax=plt.subplots(figsize=(18,15))
    for png in sorted(glob.glob(f"{ROOT}/navvis_export/orthophotos/underlay/plan_*_{lvl}.png")):
        im,ext=pgw_extent(png)
        ax.imshow(np.asarray(im.convert("L")),extent=ext,cmap="gray",alpha=0.6,zorder=0)
    odoc=ezdxf.readfile(OVL)
    nav_segs=[[(e.dxf.start.x,e.dxf.start.y),(e.dxf.end.x,e.dxf.end.y)]
              for e in odoc.modelspace().query(f'LINE[layer=="NAVVIS-MURS-{lvl}"]')]
    ax.add_collection(LineCollection(nav_segs,colors="black",lw=1.4,zorder=3,alpha=0.9))
    if archSegs:
        moved=[[(a[0]+T[0],a[1]+T[1]),(b[0]+T[0],b[1]+T[1])] for a,b in archSegs]
        mids=np.array([[(a[0]+b[0])/2+T[0],(a[1]+b[1])/2+T[1]] for a,b in archSegs])
        dmid=NAVtree.query(mids)[0]
        lc=LineCollection(moved,cmap="RdYlGn_r",norm=plt.Normalize(0,1.0),array=dmid,
                          lw=1.3,zorder=4,alpha=0.95)
        ax.add_collection(lc)
        cb=fig.colorbar(lc,ax=ax,fraction=0.025,pad=0.01)
        cb.set_label("écart mur projet → existant (m)  ·  design wall offset vs as-built (m)")
    for q in polys:
        v=xfc(q["v"]); L=q.get("L"); col=LOT_COLORS((L if L else 19)%20)
        ax.add_patch(MplPoly(v,closed=True,facecolor=col,edgecolor=col,lw=1.6,alpha=0.30,zorder=5))
        ax.add_patch(MplPoly(v,closed=True,fill=False,edgecolor=col,lw=2.0,zorder=6))
    for lb in labels:
        p=xfc(lb["pos"]); L=lb["L"]; ar=lb["poly"]["area_m2"]
        ax.annotate(f"L{L}\n{ar:.0f} m²",p,ha="center",va="center",fontsize=11,fontweight="bold",
                    zorder=7,bbox=dict(boxstyle="round,pad=0.25",fc="white",ec=LOT_COLORS(L%20),lw=2,alpha=0.9))
    floor = "+0 (rez-de-chaussée)" if lvl=="0" else "+1 (étage)"
    ax.set_xlim(-50,40); ax.set_ylim(-52,30); ax.set_aspect("equal"); ax.grid(alpha=0.15)
    ax.set_xlabel("NavVis-local X (m)"); ax.set_ylabel("NavVis-local Y (m)")
    ax.set_title(
        f"Ferme du Temple — niveau {floor} — PLAN DE DIVISION (projet) sur orthophoto (existant)\n"
        f"Recalage par TRANSLATION seule (rot 0°, échelle 1:1) — AUCUN ajustement: les écarts projet/existant sont visibles.\n"
        f"Murs noirs = existant (scan NavVis). Murs colorés = projet (couleur = écart). "
        f"Écart médian {div['median_m']:.2f} m · p90 {div['p90_m']:.2f} m · max {div['max_m']:.2f} m · "
        f"{div['frac_gt_0.3m']*100:.0f}% > 0,3 m.\n"
        f"Document de travail — ne pas utiliser pour acte (valeurs à confirmer géomètre/architecte).",
        fontsize=10)
    png=f"{ROOT}/reference/plandedivision_vs_navvis_N{lvl}.png"
    pdf=f"{ROOT}/reference/plandedivision_vs_navvis_N{lvl}.pdf"
    fig.savefig(png,dpi=170,bbox_inches="tight"); fig.savefig(pdf,bbox_inches="tight"); plt.close(fig)
    print(f"N{lvl}: divergence {div} -> {png} , {pdf}")
    return {"level":lvl,"divergence":div,"lots":sorted(set(lb['L'] for lb in labels))}

T = register_translation()
print(f"shared translation (architect cm/100 -> NavVis-local m): ({T[0]:.3f},{T[1]:.3f})")
out=[render("0",T), render("1",T)]
json.dump({"method":"translation-only registration (rot 0, scale 1); single shared translation "
           "fixed from ground floor; NO fitting; divergence preserved",
           "transform":"nav_xy_m = xy_architect_cm/100 + T",
           "shared_translation_m":[float(T[0]),float(T[1])],"results":out},
          open(f"{ROOT}/reference/plandedivision_vs_navvis_meta.json","w"), indent=2)
print("done.")
