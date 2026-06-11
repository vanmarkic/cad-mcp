#!/usr/bin/env python3
"""Vectorized Potree 2.0 BROTLI position decoder (ported verbatim from
potree/src/modules/loader/2.0/DecoderWorker_brotli.js) + hierarchy parser.
Decodes ONLY positions (geometry). World coord = X*scale+offset (local site m)."""
import struct, numpy as np, brotli

U32 = np.uint32
def _u32(a): return a.astype(np.uint64) & np.uint64(0xFFFFFFFF)

def dealign24b(x):
    # x: uint64 array holding up to 24 relevant bits; returns lower 8 deinterleaved bits
    x = x & np.uint64(0xFFFFFF)
    x = ((x & np.uint64(0b001000001000001000001000)) >> np.uint64(2)) | (x & np.uint64(0b000001000001000001000001))
    x = ((x & np.uint64(0b000011000000000011000000)) >> np.uint64(4)) | (x & np.uint64(0b000000000011000000000011))
    x = ((x & np.uint64(0b000000001111000000000000)) >> np.uint64(8)) | (x & np.uint64(0b000000000000000000001111))
    x = (x & np.uint64(0xFF))
    return x

def decode_positions(raw, numPoints, scale, offset):
    """raw = decompressed node buffer. position block = first 16*numPoints bytes."""
    pos = np.frombuffer(raw[:16*numPoints], dtype='<u4').reshape(numPoints, 4).astype(np.uint64)
    mc_1 = pos[:,0]; mc_0 = pos[:,1]; mc_3 = pos[:,2]; mc_2 = pos[:,3]
    def comp(shift):
        s = np.uint64(shift)
        a = dealign24b((mc_3 & np.uint64(0xFFFFFF)) >> s)
        b = dealign24b((((mc_3 >> np.uint64(24)) | _u32(mc_2 << np.uint64(8))) ) >> s) << np.uint64(8)
        c = dealign24b((mc_1 & np.uint64(0xFFFFFF)) >> s) << np.uint64(16)
        d = dealign24b((((mc_1 >> np.uint64(24)) | _u32(mc_0 << np.uint64(8))) ) >> s) << np.uint64(24)
        return (a | b | c | d).astype(np.int64)
    X = comp(0); Y = comp(1); Z = comp(2)
    wx = X*scale[0] + offset[0]
    wy = Y*scale[1] + offset[1]
    wz = Z*scale[2] + offset[2]
    return np.column_stack([wx, wy, wz])

# ---------- hierarchy.bin parser (Potree 2.0) ----------
# node record (22 bytes): type:u8, childMask:u8, numPoints:u32, byteOffset:i64, byteSize:i64
def parse_hierarchy(hbytes, first_chunk_size, step_size, bbox_min, bbox_max):
    """Returns list of nodes: dict(name,level,bbox_min,bbox_max,numPoints,byteOffset,byteSize).
    Handles proxy nodes (type==2) which point to sub-chunks WITHIN hierarchy.bin."""
    nodes = []
    root = {"name":"r","level":0,"bmin":list(bbox_min),"bmax":list(bbox_max),
            "hoffset":0,"hsize":first_chunk_size}
    def child_bbox(bmin,bmax,idx):
        mid = [(bmin[i]+bmax[i])/2 for i in range(3)]
        nmin=list(bmin); nmax=list(bmax)
        if idx & 1: nmin[2]=mid[2]
        else:       nmax[2]=mid[2]
        if idx & 2: nmin[1]=mid[1]
        else:       nmax[1]=mid[1]
        if idx & 4: nmin[0]=mid[0]
        else:       nmax[0]=mid[0]
        return nmin,nmax
    def load_chunk(node):
        # parse a contiguous hierarchy chunk starting at node.hoffset for node.hsize bytes,
        # in breadth-first order beginning with `node`.
        stack=[node]
        off=node["hoffset"]; end=node["hoffset"]+node["hsize"]
        # BFS within this chunk
        queue=[node]
        local_off=node["hoffset"]
        i=local_off
        # Potree writes nodes in DFS order within a chunk; we read sequentially and use a queue.
        q=[node]
        ptr=node["hoffset"]
        # iterate sequentially through the chunk, assigning records to queued nodes (BFS)
        from collections import deque
        dq=deque([node])
        p=node["hoffset"]
        chunk_end=node["hoffset"]+node["hsize"]
        while dq and p < chunk_end:
            cur=dq.popleft()
            typ,cmask,npts,boff,bsize=struct.unpack_from("<BBIqq",hbytes,p)
            p+=22
            cur["type"]=typ; cur["numPoints"]=npts; cur["byteOffset"]=boff; cur["byteSize"]=bsize
            if typ==2:
                # proxy: descends into another chunk at (boff,bsize) in hierarchy.bin
                cur["hoffset"]=boff; cur["hsize"]=bsize
                proxy_targets.append(cur)
            else:
                nodes.append(cur)
                for ci in range(8):
                    if cmask & (1<<ci):
                        nmin,nmax=child_bbox(cur["bmin"],cur["bmax"],ci)
                        child={"name":cur["name"]+str(ci),"level":cur["level"]+1,
                               "bmin":nmin,"bmax":nmax}
                        dq.append(child)
        return
    proxy_targets=[]
    load_chunk(root)
    # resolve proxies recursively
    while proxy_targets:
        pt=proxy_targets.pop()
        load_chunk(pt)
    return nodes

if __name__=="__main__":
    import json,sys,urllib.request
    meta=json.load(open(sys.argv[1] if len(sys.argv)>1 else "cloud_8729.json"))
    scale=meta["scale"]; offset=meta["offset"]
    bmin=meta["boundingBox"]["min"]; bmax=meta["boundingBox"]["max"]
    h=open("hier_8729.bin","rb").read()
    # ROOT node validation
    typ,cmask,npts,boff,bsize=struct.unpack_from("<BBIqq",h,0)
    url=open("octurl_8729.txt").read().strip()
    req=urllib.request.Request(url,headers={"Range":f"bytes={boff}-{boff+bsize-1}"})
    comp=urllib.request.urlopen(req,timeout=60).read()
    raw=brotli.decompress(comp)
    P=decode_positions(raw,npts,scale,offset)
    print("decoded root pts:",P.shape[0])
    print("X range %.2f..%.2f  (bbox %.2f..%.2f)"%(P[:,0].min(),P[:,0].max(),bmin[0],bmax[0]))
    print("Y range %.2f..%.2f  (bbox %.2f..%.2f)"%(P[:,1].min(),P[:,1].max(),bmin[1],bmax[1]))
    print("Z range %.2f..%.2f  (bbox %.2f..%.2f)"%(P[:,2].min(),P[:,2].max(),bmin[2],bmax[2]))
    inb=((P[:,0]>=bmin[0])&(P[:,0]<=bmax[0])&(P[:,1]>=bmin[1])&(P[:,1]<=bmax[1])&(P[:,2]>=bmin[2])&(P[:,2]<=bmax[2])).mean()
    print("fraction in bbox: %.4f"%inb)
    # Aile Sud-Est footprint region (local scs): x -4.25..34.7, y -40.3..-0.46
    nearfp=((P[:,0]>-6)&(P[:,0]<37)&(P[:,1]>-42)&(P[:,1]<2)).mean()
    print("fraction near Aile Sud-Est footprint XY: %.4f"%nearfp)
    print("Z histogram (floor levels? AsE floor0 base -0.86, floor1 base 3.21):")
    hist,edges=np.histogram(P[:,2],bins=20)
    for c,(a,b) in zip(hist,zip(edges[:-1],edges[1:])):
        print(f"   {a:6.1f}..{b:6.1f}: {'#'*int(40*c/hist.max())} {c}")
