#!/usr/bin/env python3
"""POTREE2 BROTLI decoder WITH rgb. Extends decode_potree2.decode_positions by also
decoding the colour block (8 bytes/pt, right after the 16 byte/pt position block),
ported from potree DecoderWorker_brotli.js. Returns (XYZ_world_m, RGB_uint8)."""
import struct, numpy as np, brotli
from decode_potree2 import parse_hierarchy, dealign24b, _u32

def decode_pos_rgb(raw, numPoints, scale, offset):
    # --- positions: first 16*N bytes (4 u32/pt) ---
    pos = np.frombuffer(raw[:16*numPoints], dtype='<u4').reshape(numPoints, 4).astype(np.uint64)
    mc_1 = pos[:,0]; mc_0 = pos[:,1]; mc_3 = pos[:,2]; mc_2 = pos[:,3]
    def comp(shift):
        s = np.uint64(shift)
        a = dealign24b((mc_3 & np.uint64(0xFFFFFF)) >> s)
        b = dealign24b((((mc_3 >> np.uint64(24)) | _u32(mc_2 << np.uint64(8)))) >> s) << np.uint64(8)
        c = dealign24b((mc_1 & np.uint64(0xFFFFFF)) >> s) << np.uint64(16)
        d = dealign24b((((mc_1 >> np.uint64(24)) | _u32(mc_0 << np.uint64(8)))) >> s) << np.uint64(24)
        return (a | b | c | d).astype(np.int64)
    X = comp(0); Y = comp(1); Z = comp(2)
    XYZ = np.column_stack([X*scale[0]+offset[0], Y*scale[1]+offset[1], Z*scale[2]+offset[2]])

    # --- colours: next 8*N bytes (2 u32/pt: word0 @ byte0 = mc_1, word1 @ byte4 = mc_0) ---
    cbase = 16*numPoints
    col = np.frombuffer(raw[cbase:cbase+8*numPoints], dtype='<u4').reshape(numPoints, 2).astype(np.uint64)
    cm_1 = col[:,0]; cm_0 = col[:,1]
    def comc(shift):
        s = np.uint64(shift)
        a = dealign24b((cm_1 & np.uint64(0xFFFFFF)) >> s)
        b = dealign24b((((cm_1 >> np.uint64(24)) | _u32(cm_0 << np.uint64(8)))) >> s) << np.uint64(8)
        return (a | b).astype(np.int64)
    R = comc(0); G = comc(1); B = comc(2)
    rgb = np.column_stack([R, G, B])
    rgb = np.where(rgb > 255, rgb // 256, rgb).astype(np.uint8)   # 16-bit -> 8-bit
    return XYZ, rgb


def iter_nodes(ds, want_box=None):
    """Yield (XYZ, RGB) per octree node of dataset ds, optionally prefiltered to an
    XY/Z world box want_box=(x0,x1,y0,y1,z0,z1)."""
    import json
    meta = json.load(open(f"cloud_{ds}.json"))
    scale = meta["scale"]; offset = meta["offset"]; hy = meta["hierarchy"]
    h = open(f"hier_{ds}.bin","rb").read()
    nodes = parse_hierarchy(h, hy["firstChunkSize"], hy["stepSize"],
                            meta["boundingBox"]["min"], meta["boundingBox"]["max"])
    oct = np.memmap(f"octree_{ds}.bin", dtype=np.uint8, mode="r")
    for nd in nodes:
        if nd["numPoints"] == 0: continue
        if want_box is not None:
            x0,x1,y0,y1,z0,z1 = want_box
            bx0,by0,bz0 = nd["bmin"]; bx1,by1,bz1 = nd["bmax"]
            if bx1<x0 or bx0>x1 or by1<y0 or by0>y1 or bz1<z0 or bz0>z1: continue
        raw = brotli.decompress(bytes(oct[nd["byteOffset"]:nd["byteOffset"]+nd["byteSize"]]))
        yield decode_pos_rgb(raw, nd["numPoints"], scale, offset)


if __name__ == "__main__":
    import sys, json
    from PIL import Image
    # Validate: decode Aile Sud-Est region from ds 8729, render a top-down RGB thumb.
    ds = int(sys.argv[1]) if len(sys.argv)>1 else 8729
    box = (-6, 37, -42, 2, -2, 16)   # Aile Sud-Est XY (local m) + z window
    XS=[]; CS=[]; npt=0
    for XYZ, RGB in iter_nodes(ds, box):
        m = ((XYZ[:,0]>=box[0])&(XYZ[:,0]<=box[1])&(XYZ[:,1]>=box[2])&(XYZ[:,1]<=box[3])
             &(XYZ[:,2]>=box[4])&(XYZ[:,2]<=box[5]))
        if m.any(): XS.append(XYZ[m]); CS.append(RGB[m]); npt+=int(m.sum())
    XYZ=np.vstack(XS); RGB=np.vstack(CS)
    print("points:",npt)
    print("RGB mean/std:",RGB.mean(0).round(1), RGB.std(0).round(1),
          " (std~0 would mean grayscale/broken)")
    # top-down 1cm/px
    mpp=0.02
    x0,y0=XYZ[:,0].min(),XYZ[:,1].min()
    cols=((XYZ[:,0]-x0)/mpp).astype(int); rows=((XYZ[:,1]-y0)/mpp).astype(int)
    W=cols.max()+1; H=rows.max()+1
    img=np.full((H,W,3),255,np.uint8)
    order=np.argsort(XYZ[:,2])           # higher z drawn last (top-down: roofs on top)
    img[rows[order],cols[order]]=RGB[order]
    Image.fromarray(img[::-1]).save("/tmp/poc/_rgbtest_topdown.png")
    print("wrote /tmp/poc/_rgbtest_topdown.png", (W,H))
