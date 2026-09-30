#!/usr/bin/env python3
"""Indicative dimensioned RDC plan from the architect file 260608.
Renders walls+labels (ezdxf backend) to scale, overlays a 5 m measurement grid,
graphic scale bar, north arrow, overall oriented-envelope dimensions, and a
clear 'COTES INDICATIVES - A CONFIRMER' title block. Units in file = cm."""
import ezdxf, numpy as np, math, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrow, Rectangle
from shapely.geometry import LineString
from shapely.ops import unary_union
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

SRC="sources/260608_FermeduTemple.dxf"
doc=ezdxf.readfile(SRC); msp=doc.modelspace()

# --- freeze layers we don't want in the contractor plan ---
for ly in ("Lijnen-schaduw",):
    if ly in doc.layers: doc.layers.get(ly).off()

# --- collect wall vertices/segments (cm) for envelope + courtyard ---
wall_layers={"Bestaand-4 massa","_Nieuw-4 massa","Bestaand-3 snede"}
segs=[]; pts=[]
for e in msp:
    if e.dxf.layer not in wall_layers: continue
    t=e.dxftype()
    try:
        if t=="LINE":
            a=(e.dxf.start[0],e.dxf.start[1]); b=(e.dxf.end[0],e.dxf.end[1]); segs.append([a,b]); pts+=[a,b]
        elif t=="LWPOLYLINE":
            pp=[(p[0],p[1]) for p in e.get_points('xy')]; pts+=pp
            for x,y in zip(pp,pp[1:]): segs.append([x,y])
        elif t=="POLYLINE":
            pp=[(v.dxf.location[0],v.dxf.location[1]) for v in e.vertices]; pts+=pp
            for x,y in zip(pp,pp[1:]): segs.append([x,y])
        elif t in ("SOLID","3DFACE","TRACE"):
            pp=[(e[i][0],e[i][1]) for i in range(4)]; pts+=pp
            for x,y in zip(pp,pp[1:]+pp[:1]): segs.append([x,y])
    except Exception: pass
P=np.array(pts,float)
xmin,ymin=P.min(0); xmax,ymax=P.max(0)

# --- oriented envelope (cm->m) ---
from shapely.geometry import MultiPoint
mrr=np.array(MultiPoint(P).minimum_rotated_rectangle.exterior.coords)
e0=np.linalg.norm(mrr[1]-mrr[0])/100.0; e1=np.linalg.norm(mrr[2]-mrr[1])/100.0
L,Wd=max(e0,e1),min(e0,e1)

# --- courtyard(s): holes of the buffered wall blob ---
ls=[LineString(s) for s in segs if s[0]!=s[1]]
blob=unary_union([l.buffer(120) for l in ls])  # 1.2 m in cm
courts=[]
geoms=list(blob.geoms) if blob.geom_type=="MultiPolygon" else [blob]
for g in geoms:
    for ring in g.interiors:
        rp=np.array(ring.coords)
        cr=np.array(LineString(ring).minimum_rotated_rectangle.exterior.coords) if False else None
        # oriented bbox of the hole
        from shapely.geometry import Polygon
        m=np.array(Polygon(ring).minimum_rotated_rectangle.exterior.coords)
        a=np.linalg.norm(m[1]-m[0])/100; b=np.linalg.norm(m[2]-m[1])/100
        if a*b>2000:  # >0.2 are? area in cm2; >2000 cm2 -> keep big courts ( >... )
            courts.append((Polygon(ring).centroid, max(a,b), min(a,b), Polygon(ring).area/1e4))
courts=[c for c in courts if c[3]>20]  # area>20 m2

# ---------------- render ----------------
PAD=400  # 4 m margin (cm)
fig=plt.figure(figsize=(23.4,16.5))  # A1 landscape
ax=fig.add_axes([0.04,0.06,0.78,0.9]); ax.set_aspect('equal'); ax.axis('off')
Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(msp, finalize=False)
ax.set_xlim(xmin-PAD, xmax+PAD); ax.set_ylim(ymin-PAD, ymax+PAD)

# 5 m measurement grid (local origin at SW corner), light
g0x=math.floor(xmin/500)*500; g0y=math.floor(ymin/500)*500
for gx in np.arange(g0x, xmax+500, 500):
    ax.axvline(gx, color="0.82", lw=0.4, zorder=0)
for gy in np.arange(g0y, ymax+500, 500):
    ax.axhline(gy, color="0.82", lw=0.4, zorder=0)
# 25 m major grid
for gx in np.arange(math.floor(xmin/2500)*2500, xmax+2500, 2500):
    ax.axvline(gx, color="0.62", lw=0.7, zorder=0)
for gy in np.arange(math.floor(ymin/2500)*2500, ymax+2500, 2500):
    ax.axhline(gy, color="0.62", lw=0.7, zorder=0)

# overall oriented envelope (dashed) + dims
ax.plot(mrr[:,0], mrr[:,1], ls="--", color="crimson", lw=1.2, zorder=5)
def dimlabel(p,q,txt,off=0):
    mid=((p[0]+q[0])/2,(p[1]+q[1])/2)
    ax.annotate(txt, mid, color="crimson", fontsize=13, fontweight="bold",
                ha="center", va="center",
                bbox=dict(fc="white",ec="crimson",pad=1.5))
dimlabel(mrr[0],mrr[1], f"{e0:.1f} m")
dimlabel(mrr[1],mrr[2], f"{e1:.1f} m")

# courtyard dims
for cen,a,b,ar in courts:
    ax.annotate(f"cour\n~{a:.0f} x {b:.0f} m", (cen.x,cen.y), color="darkgreen",
                fontsize=11, ha="center", va="center",
                bbox=dict(fc="#eaffea",ec="darkgreen",pad=1.5), zorder=6)

# scale bar (10 m) bottom-left in data coords
sbx=xmin-PAD+300; sby=ymin-PAD+250
ax.add_patch(Rectangle((sbx,sby),1000,60,fc="black",ec="black"))      # 0-10 m black
ax.add_patch(Rectangle((sbx,sby),500,60,fc="white",ec="black"))       # 0-5 m white
ax.text(sbx,sby+130,"0",fontsize=11,ha="center")
ax.text(sbx+500,sby+130,"5",fontsize=11,ha="center")
ax.text(sbx+1000,sby+130,"10 m",fontsize=11,ha="center")
ax.text(sbx+500,sby-160,"Echelle graphique",fontsize=10,ha="center",style="italic")

# north arrow (top-right of plan area); plan rotated ~15deg -> show true north up
nx,ny=xmax-200, ymax+PAD-300
ax.annotate("N", (nx,ny+450), ha="center", fontsize=14, fontweight="bold")
ax.add_patch(FancyArrow(nx,ny,0,380,width=18,head_width=70,head_length=110,
                        fc="black",ec="black"))

# ---- title / disclaimer panel (right margin) ----
tx=fig.add_axes([0.83,0.06,0.15,0.9]); tx.axis('off')
panel=(
 "FERME DU TEMPLE - Frameries\n"
 "Plan REZ-DE-CHAUSSEE (projet)\n"
 "Cotes indicatives\n"
 "______________________________\n\n"
 "Source : plan architecte 260608\n"
 "(geometrie du projet, AutoCAD).\n\n"
 "Emprise hors-tout du complexe :\n"
 f"  ~ {L:.0f} x {Wd:.0f} m (rectangle\n   d'encombrement, trait rouge).\n\n"
 "Grille de mesure : 5 m (fine) /\n  25 m (epaisse).\n"
 "Echelle graphique : voir reglet\n  en bas a gauche.\n\n"
 "Les surfaces (m2) inscrites sont\ncelles du plan architecte.\n\n"
 "/!\\ COTES INDICATIVES, relevees\n"
 "sur le plan PROJET de l'architecte.\n"
 "A FAIRE CONFIRMER par l'architecte\n"
 "et le geometre avant chiffrage\n"
 "definitif. L'etage (+1) n'est pas\n"
 "dessine separement dans ce fichier.\n\n"
 "Pour l'implantation et les niveaux\nexterieurs : voir le releve\n"
 "topographique du geometre (6190)."
)
tx.text(0,1,panel,va="top",ha="left",fontsize=11,family="monospace")
tx.add_patch(Rectangle((-0.05,-0.02),1.1,1.04,fill=False,ec="black",lw=1.2,
                       transform=tx.transAxes,clip_on=False))

out="/tmp/poc/260608_RDC_cotes_indicatives.pdf"
fig.savefig(out, dpi=200); plt.close(fig)
print("WROTE",out)
print(f"envelope {L:.1f} x {Wd:.1f} m; courts={[(round(a),round(b),round(ar)) for _,a,b,ar in courts]}")
