#!/usr/bin/env python3
"""Vectorize wall cross-sections from a storey-band point-cloud slab into polylines.
thin floor-relative cut -> occupancy raster -> clean mask -> marching-squares
contours -> simplify. Robust to debris via low-percentile floor estimate."""
import numpy as np
from scipy import ndimage
from skimage import measure, morphology
from shapely.geometry import LineString

def slab_mask(P, cut_lo=0.9, cut_hi=1.3, cell=0.02, min_pts=1, floor_pct=5):
    """Thin architectural cut at [floor+cut_lo, floor+cut_hi]; floor = low-percentile z
    of the slab (robust to debris). Occupancy raster preserves true wall thickness."""
    S=P
    if len(S)<50: return None
    floor=np.percentile(S[:,2], floor_pct)
    z=S[:,2]; keep=(z>=floor+cut_lo)&(z<=floor+cut_hi)
    S=S[keep][:,:2]
    if len(S)<50: return None
    x0,y0=S[:,0].min()-0.1, S[:,1].min()-0.1
    nx=int((S[:,0].max()-x0)/cell)+2; ny=int((S[:,1].max()-y0)/cell)+2
    ix=((S[:,0]-x0)/cell).astype(int); iy=((S[:,1]-y0)/cell).astype(int)
    cnt=np.zeros((ny,nx),dtype=np.int32); np.add.at(cnt,(iy,ix),1)
    return (cnt>=min_pts), x0, y0, cell, cnt

def clean_mask(occ, cell, close_m=0.06, min_area_m2=0.25):
    r=max(1,int(round(close_m/cell)))
    m=morphology.binary_closing(occ, morphology.disk(r))
    m=morphology.remove_small_holes(m, area_threshold=int((0.15/cell)**2))
    m=morphology.remove_small_objects(m, min_size=int(min_area_m2/(cell*cell)))
    return m

def vectorize(mask, x0, y0, cell, smooth=1.0, simp_m=0.04, min_len_m=0.8):
    f=ndimage.gaussian_filter(mask.astype(float), smooth)
    polys=[]
    for c in measure.find_contours(f, 0.5):
        xy=np.column_stack([x0+c[:,1]*cell, y0+c[:,0]*cell])
        if len(xy)<3: continue
        ls=LineString(xy)
        if ls.length<min_len_m: continue
        polys.append(np.array(ls.simplify(simp_m).coords))
    return polys

def process(P, base=None, **kw):
    r=slab_mask(P, cut_lo=kw.get("cut_lo",0.9), cut_hi=kw.get("cut_hi",1.3),
                cell=kw.get("cell",0.02), min_pts=kw.get("min_pts",1), floor_pct=kw.get("floor_pct",5))
    if r is None: return [],None
    occ,x0,y0,cell,cnt=r
    m=clean_mask(occ, cell, close_m=kw.get("close_m",0.06), min_area_m2=kw.get("min_area_m2",0.25))
    polys=vectorize(m,x0,y0,cell, smooth=kw.get("smooth",1.0),
                    simp_m=kw.get("simp_m",0.04), min_len_m=kw.get("min_len_m",0.8))
    return polys,(m,x0,y0,cell)
