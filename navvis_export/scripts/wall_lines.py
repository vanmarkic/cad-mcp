#!/usr/bin/env python3
"""As-built wall extraction as clean straight segments:
thin cut -> occupancy -> denoise (drop compact debris) -> skeleton -> Hough segments
-> snap to the building's 2 dominant axes -> merge collinear -> long wall lines."""
import numpy as np
from skimage import morphology, measure
from skimage.transform import probabilistic_hough_line

def _wallmask(P, cell, cut):
    fl=np.percentile(P[:,2],5); z=P[:,2]
    S=P[(z>=fl+cut[0])&(z<=fl+cut[1])][:,:2]
    if len(S)<80: return None
    x0,y0=S[:,0].min()-0.3,S[:,1].min()-0.3
    nx=int((S[:,0].max()-x0)/cell)+3; ny=int((S[:,1].max()-y0)/cell)+3
    ix=((S[:,0]-x0)/cell).astype(int); iy=((S[:,1]-y0)/cell).astype(int)
    cnt=np.zeros((ny,nx),np.int32); np.add.at(cnt,(iy,ix),1)
    m=cnt>=2
    m=morphology.binary_closing(m,morphology.disk(int(0.07/cell)))
    m=morphology.remove_small_holes(m,area_threshold=int((0.2/cell)**2))
    lab=measure.label(m); keep=np.zeros_like(m)
    for r in measure.regionprops(lab):
        a=r.area*cell*cell; el=r.axis_major_length/max(r.axis_minor_length,1e-6)
        if a>=0.7 or (el>=3 and a>=0.12): keep[lab==r.label]=True
    return keep,x0,y0,cell

def _dom_angle(segs):
    if not segs: return 0.0
    w=[];a=[]
    for (p,q) in segs:
        v=np.subtract(q,p); L=np.hypot(*v)
        a.append(np.degrees(np.arctan2(v[1],v[0]))%90); w.append(L)
    h,e=np.histogram(a,bins=180,range=(0,90),weights=w)
    return e[h.argmax()]+0.25

def _snap(segs, th0, tol=20):
    out=[]
    for (p,q) in segs:
        p=np.array(p,float);q=np.array(q,float);mid=(p+q)/2;v=q-p;L=np.hypot(*v)
        t=np.degrees(np.arctan2(v[1],v[0])); best=None
        for cand in (th0,th0+90):
            if abs(((t-cand+90)%180)-90)<tol: best=cand;break
        if best is None: best=t
        rad=np.radians(best);d=np.array([np.cos(rad),np.sin(rad)])
        out.append((mid-d*L/2, mid+d*L/2, best%180))
    return out

def _merge(snapped, perp=0.10, gap=0.6, minlen=0.5):
    groups={}
    for p,q,ang in snapped:
        rad=np.radians(ang); d=np.array([np.cos(rad),np.sin(rad)]); n=np.array([-d[1],d[0]])
        off=np.dot((p+q)/2, n)
        key=(round(ang/5)*5, round(off/perp))
        t0=np.dot(p,d); t1=np.dot(q,d)
        groups.setdefault(key,[]).append((min(t0,t1),max(t0,t1),d,n,off))
    out=[]
    for items in groups.values():
        d=items[0][2]; n=items[0][3]; off=np.mean([it[4] for it in items])
        iv=sorted((it[0],it[1]) for it in items)
        cs,ce=iv[0]
        merged=[]
        for s,e in iv[1:]:
            if s<=ce+gap: ce=max(ce,e)
            else: merged.append((cs,ce)); cs,ce=s,e
        merged.append((cs,ce))
        for s,e in merged:
            if e-s<minlen: continue
            out.append((tuple(d*s+n*off), tuple(d*e+n*off)))
    return out

def building_walls(P, cut=(0.85,1.35), cell=0.025, hough_len=0.6, hough_gap=0.3):
    r=_wallmask(P,cell,cut)
    if r is None: return [],0.0
    m,x0,y0,cell=r
    sk=morphology.skeletonize(m)
    segs=probabilistic_hough_line(sk, threshold=8, line_length=int(hough_len/cell),
                                  line_gap=int(hough_gap/cell))
    segs=[((x0+a[0]*cell,y0+a[1]*cell),(x0+b[0]*cell,y0+b[1]*cell)) for a,b in segs]
    if not segs: return [],0.0
    th0=_dom_angle(segs)
    walls=_merge(_snap(segs,th0), gap=0.6, minlen=0.6)
    return walls, th0
