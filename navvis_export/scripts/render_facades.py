#!/usr/bin/env python3
"""Render OUTWARD exterior façades of the Ferme du Temple as thin outside-in orthographic
RGB photos from the NavVis as-built point cloud.

For each outward façade (facades_outward.json):
  * gather wall-column points from BOTH datasets (8729+8730);
  * auto-detect the dominant scanned wall plane d* (densest depth among body-height pts) —
    the footprint line is offset from the real surface by up to ~3 m and coverage of true
    outer faces is partial (indoor/courtyard-walked scan), so we anchor on the points;
  * keep a slab [d*-SLAB_IN, d*+SLAB_OUT] and view orthographically from OUTSIDE
    (painter order: outermost points drawn last / on top, so the near skin wins);
  * colour by RGB, splat to fill, auto-fit the z (height) window.

Outputs per façade: belev_ext_<label>.tiff (RGBA) + _prev_<label>.png + a coverage stat,
and facades_ext_specs.json (px<->m georef key)."""
import json, os, sys, numpy as np
from PIL import Image
from decode_rgb import iter_nodes
Image.MAX_IMAGE_PIXELS=None

OUTDIR="/tmp/poc/fac_ext"; os.makedirs(OUTDIR,exist_ok=True)
MPP=0.015
SLAB_IN =float(os.environ.get("SLAB_IN","1.6"))    # m inward from the detected wall plane
SLAB_OUT=float(os.environ.get("SLAB_OUT","0.5"))   # m outward (surface roughness/reveals)
UPAD=0.4; ZMIN=-1.5; SPLAT=2; SEARCH=8.0           # plane-search half-window (m)
FAC={o["label"]:o for o in json.load(open("/tmp/poc/facades_outward.json"))}

def gather(o):
    n=np.array(o["n"]); t=np.array(o["t"]); e0=np.array(o["end0"]); plane=o["plane_v"]; L=o["length"]
    box=(min(o["end0"][0],o["end1"][0])-SEARCH-1, max(o["end0"][0],o["end1"][0])+SEARCH+1,
         min(o["end0"][1],o["end1"][1])-SEARCH-1, max(o["end0"][1],o["end1"][1])+SEARCH+1, ZMIN-0.5, 30.0)
    U=[];Z=[];D=[];C=[]
    for ds in (8729,8730):
        for XYZ,RGB in iter_nodes(ds, box):
            u=(XYZ[:,0]-e0[0])*t[0]+(XYZ[:,1]-e0[1])*t[1]
            d=XYZ[:,0]*n[0]+XYZ[:,1]*n[1]-plane
            m=(u>=-UPAD)&(u<=L+UPAD)&(np.abs(d)<=SEARCH)&(XYZ[:,2]>=ZMIN)
            if m.any(): U.append(u[m]);Z.append(XYZ[m,2]);D.append(d[m]);C.append(RGB[m])
    if not U: return None
    return np.concatenate(U),np.concatenate(Z),np.concatenate(D),np.vstack(C)

VEG=os.environ.get("VEG","1")=="1"     # drop excess-green (vegetation) points
def veg_mask(C):
    r,g,b=C[:,0].astype(int),C[:,1].astype(int),C[:,2].astype(int)
    exg=2*g-r-b                         # excess green index
    return (exg>28)&(g>r+8)&(g>b+8)

def render(o):
    g=gather(o)
    if g is None: return None
    U,Z,D,C=g
    if VEG:
        keep=~veg_mask(C); U,Z,D,C=U[keep],Z[keep],D[keep],C[keep]
    body=(Z>0.6)&(Z<4.5)
    src=D[body] if body.sum()>500 else D
    # wall is near the footprint line: constrain plane search to a sane band around 0
    band=(src>=-3.5)&(src<=1.5)
    if band.sum()>300:
        hb,edg=np.histogram(src[band], bins=np.arange(-3.5,1.5,0.1)); dstar=edg[hb.argmax()]+0.05
    else:
        hb,edg=np.histogram(src, bins=np.arange(-SEARCH,SEARCH,0.1)); dstar=edg[hb.argmax()]+0.05
    keep=(D>=dstar-SLAB_IN)&(D<=dstar+SLAB_OUT)
    U,Z,D,C=U[keep],Z[keep],D[keep],C[keep]
    cov="SPARSE" if len(U)<20000 else "ok"
    # robust ridge = "persistent column tops": per 0.1 m-wide u-column take the max z, but
    # only for columns with enough support, then a high percentile (kills vegetation spikes
    # that occupy few columns, keeps a real ridge/wall-top spanning many columns).
    cu=np.floor(U/0.1).astype(int)
    omax={}; ocnt={}
    np.maximum.at  # noop to hint vectorize intent
    order0=np.argsort(cu); cs=cu[order0]; zs=Z[order0]
    uniq,idx,counts=np.unique(cs,return_index=True,return_counts=True)
    coltop=np.array([zs[idx[k]:idx[k]+counts[k]].max() for k in range(len(uniq)) if counts[k]>=15])
    zmax=(np.percentile(coltop,96) if len(coltop)>5 else np.percentile(Z,98))+0.3
    keepz=Z<=zmax+0.2; U,Z,D,C=U[keepz],Z[keepz],D[keepz],C[keepz]
    W=int(np.ceil((U.max()-(-UPAD))/MPP))+1 if len(U) else 1
    W=int(np.ceil((o["length"]+2*UPAD)/MPP)); H=int(np.ceil((zmax-ZMIN)/MPP))
    img=np.zeros((H,W,4),np.uint8)
    col=((U+UPAD)/MPP).astype(int); row=((zmax-Z)/MPP).astype(int)
    order=np.argsort(D); col,row,cc=col[order],row[order],C[order]
    for dx in range(-SPLAT,SPLAT+1):
        for dy in range(-SPLAT,SPLAT+1):
            if dx*dx+dy*dy>SPLAT*SPLAT: continue
            c2=col+dx; r2=row+dy; v=(c2>=0)&(c2<W)&(r2>=0)&(r2<H)
            img[r2[v],c2[v],:3]=cc[v]; img[r2[v],c2[v],3]=255
    fill=(img[...,3]>0).mean()
    spec=dict(name=f"belev_ext_{o['label']}", building=o["name"], side=o["side"],
              ppm=round(1/MPP,3), w=W, h=H, width_m=round(W*MPP,3),
              z_min=ZMIN, z_max=round(float(zmax),3), slab_in_m=SLAB_IN, slab_out_m=SLAB_OUT,
              wall_plane_d=round(float(dstar),3), footprint_plane_v=round(o["plane_v"],3),
              normal=o["n"], along=o["t"], u_min=o["u_min"], length=round(o["length"],2),
              end0=o["end0"], end1=o["end1"], n_points=int(len(U)),
              pixel_fill=round(float(fill),4), coverage=cov)
    return img, spec

if __name__=="__main__":
    labels=sys.argv[1:] or [l for l,o in FAC.items() if o["length"]>=7.0]
    specs=[]
    for lab in labels:
        o=FAC[lab]; r=render(o)
        if r is None: print(f"  {lab:<22} NO POINTS"); continue
        img,spec=r
        Image.fromarray(img).save(f"{OUTDIR}/belev_ext_{lab}.tiff")
        bg=Image.new("RGBA",img.shape[1::-1],(255,255,255,255))
        prev=Image.alpha_composite(bg,Image.fromarray(img)).convert("RGB")
        sc=min(1,1100/prev.width); prev=prev.resize((max(1,int(prev.width*sc)),max(1,int(prev.height*sc))))
        prev.save(f"{OUTDIR}/_prev_{lab}.png")
        specs.append(spec)
        print(f"  {lab:<22} {spec['w']}x{spec['h']}  {spec['width_m']}m  z[{ZMIN},{spec['z_max']}]  "
              f"d*={spec['wall_plane_d']:+.2f}  {spec['n_points']:>9,}pts fill={spec['pixel_fill']*100:.0f}% {spec['coverage']}")
    json.dump(specs, open(f"{OUTDIR}/facades_ext_specs.json","w"), indent=1)
    print(f"wrote {len(specs)} façades -> {OUTDIR}")
