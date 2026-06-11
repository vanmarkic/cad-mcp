#!/usr/bin/env python3
"""Build the as-built DXF floor plan (+0 / +1) of the Ferme du Temple,
purely from the NavVis point cloud. Units = cm; frame = 6190 surveyor frame
(NavVis-local + (117027.344,121045.953) m, x100). Structured like 260608."""
import json, os, numpy as np, ezdxf, warnings
warnings.filterwarnings("ignore")
import wall_lines as wl

ROOT="/Users/dragan/Documents/cad-mcp"; EXP=ROOT+"/navvis_export"; SL="/tmp/poc/slices"
OX, OY = 117027.344, 121045.953          # 6190 frame offset (m)
def Tx(x): return (x+OX)*100.0           # local m -> frame cm
def Ty(y): return (y+OY)*100.0

# building -> (floor0 base, floor1 base, emprise m2, f0 H, f1 H, has_interior)
B = {
 "Aile Ouest":        dict(f0=0.31,  f1=4.61, emp=564.27, h0=4.30, h1=None, ds=8730),
 "Aile Sud-Est":      dict(f0=-0.86, f1=3.21, emp=449.51, h0=4.07, h1=None, ds=8729),
 "Atelier":           dict(f0=-0.54, f1=3.0,  emp=454.99, h0=3.54, h1=None, ds=8730),
 "Chapelle":          dict(f0=-0.78, f1=3.49, emp=239.95, h0=4.27, h1=None, ds=8730),
 "Maison principale": dict(f0=0.95,  f1=4.88, emp=182.28, h0=3.93, h1=3.67, ds=8730),
}
# per-floor wall-cut band (floor-relative)
PARAMS={0:dict(cut=(0.85,1.35)), 1:dict(cut=(0.85,1.35))}

geo=json.load(open(EXP+"/footprints_local_m.geojson"))
FP={f["properties"]["name"]:np.array(f["geometry"]["coordinates"][0])[:,:2] for f in geo["features"]}

doc=ezdxf.new("R2018", setup=True); doc.header["$INSUNITS"]=5  # centimeters
msp=doc.modelspace()
LYR=[("0-NAVVIS-emprise",5),("Bestaand-murs-N0",7),("Bestaand-murs-N1",4),
     ("Bestaand-nuage-N0",8),("Bestaand-nuage-N1",8),("Tekst-ruimtelabel",2),
     ("NAVVIS-notes",8),("Reperes",1)]
for n,c in LYR: doc.layers.add(n,color=c)
for n in ("Bestaand-nuage-N0","Bestaand-nuage-N1"): doc.layers.get(n).off()  # evidence layers off by default

summary={}
for name,b in B.items():
    # footprint (emprise), exact
    ring=[(Tx(x),Ty(y)) for x,y in FP[name]]
    msp.add_lwpolyline(ring, close=True, dxfattribs={"layer":"0-NAVVIS-emprise"})
    cx=Tx(FP[name][:,0].mean()); cy=Ty(FP[name][:,1].mean())
    for fl in (0,1):
        fn=f"{SL}/{name.replace(' ','_')}_{fl}.npy"
        npoly=0; nverts=0
        if os.path.exists(fn) and len(np.load(fn))>=80:
            P=np.load(fn)
            walls,th0=wl.building_walls(P, cut=PARAMS[fl]["cut"])
            wlyr=f"Bestaand-murs-N{fl}"
            for wa,wb in walls:
                msp.add_line((Tx(wa[0]),Ty(wa[1])),(Tx(wb[0]),Ty(wb[1])), dxfattribs={"layer":wlyr})
                npoly+=1; nverts+=2
            # subsampled evidence points (same floor-relative cut)
            floor=np.percentile(P[:,2],5)
            zc=(P[:,2]>=floor+0.85)&(P[:,2]<=floor+1.35); S=P[zc][:,:2]
            if len(S)>6000:
                S=S[np.random.default_rng(0).choice(len(S),6000,replace=False)]
            for x,y in S: msp.add_point((Tx(x),Ty(y)), dxfattribs={"layer":f"Bestaand-nuage-N{fl}"})
        summary[(name,fl)]=(npoly,nverts)
    # label (NavVis-only data: emprise + storey heights)
    txt=(f"{name}\\P emprise (NavVis): {b['emp']:.0f} m²\\P"
         f"H N0 = {b['h0']:.2f} m" + (f"\\PH N1 = {b['h1']:.2f} m" if b['h1'] else "\\P(N1: hauteur libre/ruine)"))
    msp.add_mtext(txt, dxfattribs={"layer":"Tekst-ruimtelabel","char_height":35})\
       .set_location((cx,cy), attachment_point=5)

# ---- North arrow (+Y ~ Lambret North) & scale bar, placed SW of complex ----
allx=[Tx(FP[n][:,0].min()) for n in B]+[Tx(FP[n][:,0].max()) for n in B]
ally=[Ty(FP[n][:,1].min()) for n in B]+[Ty(FP[n][:,1].max()) for n in B]
x0=min(allx)-1200; y0=min(ally)-1200
msp.add_lwpolyline([(x0,y0),(x0,y0+800)],dxfattribs={"layer":"Reperes"})
msp.add_solid([(x0-60,y0+650),(x0+60,y0+650),(x0,y0+820)],dxfattribs={"layer":"Reperes"})
msp.add_text("N",height=120,dxfattribs={"layer":"Reperes"}).set_placement((x0+90,y0+700))
# scale bar 0..10 m (=1000 cm)
sb=x0+400
for i in range(11):
    msp.add_line((sb+i*100,y0),(sb+i*100,y0+ (60 if i%5==0 else 30)),dxfattribs={"layer":"Reperes"})
msp.add_line((sb,y0),(sb+1000,y0),dxfattribs={"layer":"Reperes"})
msp.add_text("0",height=80,dxfattribs={"layer":"Reperes"}).set_placement((sb,y0-120))
msp.add_text("10 m",height=80,dxfattribs={"layer":"Reperes"}).set_placement((sb+1000,y0-120))

note=("FERME DU TEMPLE — Avenue Joseph Wauters 227, Frameries — PLAN AS-BUILT (existant)\\P"
      "Source UNIQUE: nuage de points NavVis IVION (ImmoPass, dossier 12039, releve 2026-06-04).\\P"
      "Methode: octree POTREE2 decode -> coupe horizontale ~+1.0 m/niveau -> vectorisation des murs.\\P"
      "Murs N0 (blanc) / N1 (cyan) = faces de murs telles que relevees (ruine sans toiture). "
      "Emprise (bleu) = polygone batiment mesure NavVis. Nuage brut sur calques 'nuage' (eteints).\\P"
      "Unites: cm. Repere: frame geometre 6190 = NavVis-local + (117027.344, 121045.953) m, x100 "
      "(georef EPSG:8370 Lambert 2008: ajouter (500000,500000) m a la composante metres).\\P"
      "Maison principale: interieur N0/N1 non capte par le scan -> emprise seule.")
msp.add_mtext(note, dxfattribs={"layer":"NAVVIS-notes","char_height":55})\
   .set_location((x0, y0-400), attachment_point=1)

out=ROOT+"/navvis_export/ferme_du_temple_ASBUILT_N0_N1.dxf"
doc.saveas(out)
print("WROTE",out)
for (n,fl),(np_,nv) in sorted(summary.items()):
    print(f"  {n} +{fl}: {np_} wall polylines, {nv} verts")
