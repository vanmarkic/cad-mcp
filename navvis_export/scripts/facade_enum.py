#!/usr/bin/env python3
"""Enumerate OUTWARD-facing façade segments of the Ferme du Temple complex.

Outward = faces the open countryside, NOT the central courtyard and NOT a shared
party wall. The court is an OPEN horseshoe (gates), so we identify it explicitly as
the largest empty region of convex_hull(all footprints) minus union(footprints).
Per footprint edge, classify by what sits just OUTSIDE the wall (along +outward normal):
  in courtyard            -> inward  (exclude)
  inside another building  -> party wall (exclude)
  open air                 -> OUTWARD (keep)
Contiguous kept edges of one building within ~35° are merged into one façade plane.
Outputs facades_outward.json + a labelled diagnostic plan."""
import os, json, numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT="/Users/dragan/Documents/cad-mcp"; EXP=ROOT+"/navvis_export"
ANG={"Aile Ouest":15.9,"Aile Sud-Est":15.6,"Atelier":5.1,"Chapelle":4.5,"Maison principale":14.5}
DS ={"Aile Ouest":8730,"Aile Sud-Est":8729,"Atelier":8730,"Chapelle":8730,"Maison principale":8730}

geo=json.load(open(EXP+"/footprints_local_m.geojson"))
FP={f["properties"]["name"]: np.array(f["geometry"]["coordinates"][0])[:,:2] for f in geo["features"]}
polys={n:Polygon(r).buffer(0) for n,r in FP.items()}
union=unary_union(list(polys.values()))
hull=union.convex_hull
court_region=hull.difference(union.buffer(0.05))
# largest empty piece = the courtyard
parts=list(court_region.geoms) if court_region.geom_type=="MultiPolygon" else [court_region]
court=max(parts,key=lambda p:p.area)
print(f"hull area={hull.area:.0f}  court area={court.area:.0f}  (next={sorted((p.area for p in parts),reverse=True)[1:3]})")

def classify_edge(name,p0,p1):
    e=np.array(p1,float)-np.array(p0,float); L=np.hypot(*e)
    if L<0.35: return None
    mid=(np.array(p0,float)+np.array(p1,float))/2
    t=e/L; nrm=np.array([t[1],-t[0]])
    if not polys[name].buffer(-0.05).contains(Point(mid-nrm*0.3)):  # ensure nrm points OUT of this bldg
        nrm=-nrm
    outer=Point(mid+nrm*0.7)
    if court.buffer(0.3).contains(outer): return ("inward",mid,t,nrm,L)
    for other,poly in polys.items():
        if other!=name and poly.buffer(0.1).contains(outer): return ("party",mid,t,nrm,L)
    return ("outward",mid,t,nrm,L)

WHICH=os.environ.get("WHICH","outward")   # "outward" or "inward" (courtyard)
segments=[]
for name,ring in FP.items():
    R=ring if (ring[0]==ring[-1]).all() else np.vstack([ring,ring[0]])
    cur=None
    for i in range(len(R)-1):
        c=classify_edge(name,R[i],R[i+1])
        if c is None or c[0]!=WHICH: cur=None; continue
        _,mid,t,nrm,L=c; head=np.rad2deg(np.arctan2(t[1],t[0]))%180
        if cur and abs(((head-cur['head0']+90)%180)-90)<35:
            cur['pts'].append(R[i+1]); cur['ns'].append(nrm); cur['L']+=L
        else:
            cur=dict(name=name,pts=[R[i],R[i+1]],ns=[nrm],L=L,head0=head); segments.append(cur)

def cardinal(n):
    a=np.rad2deg(np.arctan2(n[1],n[0]))
    return ["E","NE","N","NW","W","SW","S","SE"][int(((a+22.5)%360)//45)]
out=[]
for s in segments:
    if s['L']<2.0: continue
    P=np.array(s['pts']); n=np.mean(s['ns'],0); n=n/np.hypot(*n)
    t=np.array([n[1],-n[0]]); u=P@t
    out.append(dict(name=s['name'], side=cardinal(n), ds=DS[s['name']],
        n=[float(n[0]),float(n[1])], t=[float(t[0]),float(t[1])],
        u_min=float(u.min()), u_max=float(u.max()), length=float(u.max()-u.min()),
        plane_v=float(np.median(P@n)), mid=[float(P[:,0].mean()),float(P[:,1].mean())],
        end0=[float(P[u.argmin(),0]),float(P[u.argmin(),1])],
        end1=[float(P[u.argmax(),0]),float(P[u.argmax(),1])]))
from collections import Counter
cnt=Counter((o['name'],o['side']) for o in out); seen=Counter()
for o in out:
    k=(o['name'],o['side']); seen[k]+=1
    o['label']=f"{o['name'].replace(' ','')}_{o['side']}"+(f"{seen[k]}" if cnt[k]>1 else "")
json.dump(out,open("/tmp/poc/facades_%s.json"%WHICH,"w"),indent=1)
print(f"\n{len(out)} outward façades:")
for o in out: print(f"  {o['label']:<22} len={o['length']:5.1f}m  ds={o['ds']}  mid=({o['mid'][0]:6.1f},{o['mid'][1]:6.1f})")

fig,ax=plt.subplots(figsize=(13,13))
cx,cy=np.array(court.exterior.coords).T; ax.fill(cx,cy,color="red",alpha=.10)
ax.plot(cx,cy,color="red",lw=1.5,label="courtyard")
for n,ring in FP.items():
    ax.fill(ring[:,0],ring[:,1],alpha=.12); ax.plot(*np.vstack([ring,ring[0]]).T,lw=.6,color="gray")
    c=ring.mean(0); ax.text(c[0],c[1],n,ha="center",fontsize=8)
for o in out:
    a=np.array(o['end0']); b=np.array(o['end1']); n=np.array(o['n']); m=np.array(o['mid'])
    ax.plot([a[0],b[0]],[a[1],b[1]],color="green",lw=3)
    ax.annotate("",xy=m+n*2.4,xytext=m,arrowprops=dict(arrowstyle="->",color="green",lw=1.5))
    ax.text(*(m+n*3.0),o['label'],fontsize=7,color="darkgreen",ha="center")
ax.set_aspect("equal"); ax.grid(alpha=.3)
ax.set_title("OUTWARD façades (green arrows = view direction, from outside inward)\ncourtyard=red. NavVis-local m")
fig.savefig("/tmp/poc/_facade_plan.png",dpi=110,bbox_inches="tight")
print("wrote /tmp/poc/_facade_plan.png")
