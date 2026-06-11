#!/usr/bin/env python3
"""Decode the downloaded POTREE2 octrees node-by-node and extract, per
(building, floor), the points within the building footprint XY and a Z band
around the floor cut height. Saves <building>_<floor>.npy (XYZ, NavVis-local m).
Also saves a coarse full-Z footprint cloud per building for QA/height picking."""
import json, struct, os, numpy as np, brotli
from matplotlib.path import Path
from decode_potree2 import parse_hierarchy, decode_positions

ROOT="/Users/dragan/Documents/cad-mcp"; EXP=ROOT+"/navvis_export"; OUT="/tmp/poc/slices"
os.makedirs(OUT, exist_ok=True)

# storey Z ranges (NavVis-local m) from buildings_summary.json: (zmin,zmax) per floor.
# f1 z_max is the open-to-sky cap (~30m) -> cap at base1+3.5m for the +1 plan band.
BASE = {
 "Aile Ouest":        {"ds":8730, "f0":(0.31,4.61),  "f1":(4.61,8.1)},
 "Aile Sud-Est":      {"ds":8729, "f0":(-0.86,3.21), "f1":(3.21,6.7)},
 "Atelier":           {"ds":8730, "f0":(-0.54,3.0),  "f1":(3.0,6.5)},
 "Chapelle":          {"ds":8730, "f0":(-0.78,3.49), "f1":(3.49,7.0)},
 "Maison principale": {"ds":8730, "f0":(0.95,4.88),  "f1":(4.88,8.55)},
}

# footprints (local m)
geo=json.load(open(EXP+"/footprints_local_m.geojson"))
FP={}
for f in geo["features"]:
    name=f["properties"]["name"]
    ring=f["geometry"]["coordinates"][0]
    FP[name]=Path(np.array(ring)[:,:2])

def slab_z(name, fl):
    zmin,zmax=BASE[name]["f%d"%fl]; return (zmin-0.2, zmax)   # storey band, slight floor margin

def process(ds):
    meta=json.load(open(f"cloud_{ds}.json"))
    scale=meta["scale"]; offset=meta["offset"]
    h=open(f"hier_{ds}.bin","rb").read()
    hy=meta["hierarchy"]
    nodes=parse_hierarchy(h, hy["firstChunkSize"], hy["stepSize"], meta["boundingBox"]["min"], meta["boundingBox"]["max"])
    oct=np.memmap(f"octree_{ds}.bin", dtype=np.uint8, mode="r")
    builds=[n for n,b in BASE.items() if b["ds"]==ds]
    # bands per building/floor + bbox of all footprints in this ds
    bands={(n,fl):slab_z(n,fl) for n in builds for fl in (0,1)}
    fpbb={n:(FP[n].vertices[:,0].min(),FP[n].vertices[:,0].max(),FP[n].vertices[:,1].min(),FP[n].vertices[:,1].max()) for n in builds}
    zmin_all=min(b[0] for b in bands.values()); zmax_all=max(b[1] for b in bands.values())
    acc={k:[] for k in bands}
    nproc=0
    for nd in nodes:
        if nd["numPoints"]==0: continue
        bx0,by0,bz0=nd["bmin"]; bx1,by1,bz1=nd["bmax"]
        if bz1<zmin_all or bz0>zmax_all: continue            # z prefilter
        # xy prefilter vs any footprint bbox
        if not any(not(bx1<x0 or bx0>x1 or by1<y0 or by0>y1) for (x0,x1,y0,y1) in fpbb.values()): continue
        raw=brotli.decompress(bytes(oct[nd["byteOffset"]:nd["byteOffset"]+nd["byteSize"]]))
        P=decode_positions(raw, nd["numPoints"], scale, offset)
        nproc+=1
        z=P[:,2]
        for n in builds:
            x0,x1,y0,y1=fpbb[n]
            inxy=(P[:,0]>=x0-0.6)&(P[:,0]<=x1+0.6)&(P[:,1]>=y0-0.6)&(P[:,1]<=y1+0.6)
            if not inxy.any(): continue
            for fl in (0,1):
                zlo,zhi=bands[(n,fl)]
                m=inxy&(z>=zlo)&(z<=zhi)
                if m.any(): acc[(n,fl)].append(P[m])
    print(f"[ds {ds}] decoded {nproc} nodes")
    for (n,fl),lst in acc.items():
        if not lst: print(f"   {n} +{fl}: 0 pts"); continue
        Q=np.vstack(lst)
        # precise footprint mask (buffered +0.5m via path containment on slightly grown polygon)
        path=FP[n]
        inside=path.contains_points(Q[:,:2], radius=0.5) | path.contains_points(Q[:,:2], radius=-0.0)
        Q=Q[inside]
        if len(Q)==0: print(f"   {n} +{fl}: 0 pts inside footprint"); continue
        fn=f"{OUT}/{n.replace(' ','_')}_{fl}.npy"
        np.save(fn, Q.astype(np.float32))
        print(f"   {n} +{fl}: {len(Q):,} pts  z[{Q[:,2].min():.2f},{Q[:,2].max():.2f}] -> {os.path.basename(fn)}")

if __name__=="__main__":
    import sys
    for ds in (sys.argv[1:] or [8729,8730]):
        process(int(ds))
