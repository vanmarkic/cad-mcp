#!/usr/bin/env python3
"""Consolidate ALL room/lot area sources into readable files under navvis_export/areas/.

Sources:
  - 6190 surveyor rooms (authoritative interim per-room areas)  -> /tmp/cadwork/rooms_full.json
  - NavVis building emprises + georef                            -> navvis_export/raw/api_geometry.json
  - architect PDF lot table + ateliers + 260608 current labels   -> /tmp/cadwork/facts.json
Building assignment uses the refined NavVis<->6190 transform     -> /tmp/cadwork/transform_refined.json
"""
import json, csv, math, os

ROOT = "/Users/dragan/Documents/cad-mcp"
OUT  = os.path.join(ROOT, "navvis_export", "areas")
os.makedirs(OUT, exist_ok=True)

rooms = json.load(open("/tmp/cadwork/rooms_full.json"))
ref   = json.load(open("/tmp/cadwork/transform_refined.json"))
facts = json.load(open("/tmp/cadwork/facts.json"))
api   = json.load(open(os.path.join(ROOT, "navvis_export/raw/api_geometry.json")))
sm    = api["site_model"]["body"]

OX, OY, XOFF = ref["OX"], ref["OY"], ref["xoffB"]
TG, TF = ref["refined_transform"], ref["refined_transform_first"]

def apply(x, y, t):
    th = math.radians(t["rotation_deg"]); s = t["scale"]
    rx = s*(math.cos(th)*x - math.sin(th)*y) + t["dx"]
    ry = s*(math.sin(th)*x + math.cos(th)*y) + t["dy"]
    return rx, ry

def to_navvis(rm):
    """6190 raw (x,y) -> NavVis-local (nx,ny). Ground vs first by X cluster."""
    x, y = rm["x"], rm["y"]
    if x < 118500:  # ground sheet
        return apply(x - OX, y - OY, TG), "+0"
    else:           # first-floor sheet (drawn offset +XOFF in X)
        return apply((x - XOFF) - OX, y - OY, TF), "+1"

# NavVis building polygons (shapely)
from shapely.geometry import Point, Polygon
polys = {b["name"]: Polygon(b["scs_polygon"]["coordinates"][0]) for b in sm}
foot  = {b["name"]: round(b["area"], 2) for b in sm}

# id catalog by transformed nearest to ref per_room (carry G*/F* ids)
ref_pts = {p["id"]: (p["nx"], p["ny"]) for p in ref["per_room"]}
def nearest_id(nx, ny, used):
    best, bd = None, 1e9
    for rid, (px, py) in ref_pts.items():
        if rid in used: continue
        d = math.hypot(nx-px, ny-py)
        if d < bd: bd, best = d, rid
    return best, bd

enriched, used = [], set()
for rm in rooms:
    (nx, ny), floor = to_navvis(rm)
    rid, d = nearest_id(nx, ny, used)
    if d < 2.0: used.add(rid)
    else: rid = f"?{len(used)}"
    pt = Point(nx, ny)
    inside = [(name, p.distance(pt)) for name, p in polys.items()]
    inside.sort(key=lambda t: t[1])
    bld, dist = inside[0]
    enriched.append(dict(id=rid, floor=floor, building=bld, area_m2=rm["aire"],
                         hsp_m=rm["hsp"], perim_m=rm["perim"], nd_elev_m=rm["nd"],
                         nx=round(nx,2), ny=round(ny,2), inside=bool(dist==0.0),
                         dist_m=round(dist,2)))
enriched.sort(key=lambda r:(r["floor"], r["building"], -(r["area_m2"] or 0)))

# ---- write areas_6190_rooms.csv ----
cols=["id","floor","building","area_m2","hsp_m","perim_m","nd_elev_m","nx","ny","inside","dist_m"]
with open(os.path.join(OUT,"areas_6190_rooms.csv"),"w",newline="") as fp:
    w=csv.DictWriter(fp,fieldnames=cols); w.writeheader(); w.writerows(enriched)

# ---- per-building/floor summary ----
summ={}
for r in enriched:
    summ.setdefault((r["building"],r["floor"]),[0,0.0])
    summ[(r["building"],r["floor"])][0]+=1
    summ[(r["building"],r["floor"])][1]+=r["area_m2"] or 0

# ---- markdown report ----
md=["# Room-level areas — Ferme du Temple (consolidated)\n",
    "Provenance order of authority: **NavVis as-built** (buildings only, no rooms) > **6190 surveyor** "
    "(per-room, interim) > **architect PDF** (lots, approximate).\n",
    "> ⚠️ **Caveats (voir QA_REPORT.md):**",
    "> 1. Les **trois totaux ne sont PAS comparables**: NavVis 1891 m² = somme des **emprises** (enveloppe), "
    "6190 2409 m² = **pièces intérieures** (45, sur 2 étages), PDF 1391 m² = **programme lots** (indoor).",
    "> 2. F1 «Grenier» (161 m²) est **hors emprise** (assignation non vérifiée) → la somme Maison principale +1 "
    "est gonflée; voir colonne *inside* et la note de sommes.",
    "> 3. Le total PDF 1391 **exclut 86 m² de terrasses** (L5 44, L6 42) — convention non documentée.",
    "> 4. Les étiquettes 260608 actuelles sont **doublées/contradictoires** (à corriger), L13 absent.\n",
    "## A. 6190 surveyor — measured rooms (authoritative interim)",
    "45 rooms; each carries Aire (area), Hsp (clear height), P (perimeter), Nd (floor elevation, Lambert Z).",
    "Assigned to NavVis buildings via refined transform (ground 100% inside, first 95%, mean resid 0.24 m).\n",
    "| id | étage | bâtiment | Aire m² | Hsp m | P m | Nd(z) | inside | dist m |",
    "|---|---|---|--:|--:|--:|--:|:--:|--:|"]
for r in enriched:
    md.append(f"| {r['id']} | {r['floor']} | {r['building']} | {r['area_m2']} | {r['hsp_m']} | {r['perim_m']} | {r['nd_elev_m']} | {'✓' if r['inside'] else '·'} | {r['dist_m']} |")
# sums excluding rooms whose building assignment is unverified (inside=False)
summ_in={}
for r in enriched:
    if not r["inside"]: continue
    summ_in.setdefault((r["building"],r["floor"]),[0,0.0])
    summ_in[(r["building"],r["floor"])][0]+=1
    summ_in[(r["building"],r["floor"])][1]+=r["area_m2"] or 0
unverified=[r for r in enriched if not r["inside"]]
md.append("\n### Sommes par bâtiment / étage (6190 rooms)")
md.append("> ⚠️ Les pièces marquées *non-inside* (assignation bâtiment NON vérifiée — hors emprise) sont "
          "comptées séparément. Une somme d'étage NE PEUT PAS dépasser l'emprise du bâtiment ; si c'est le cas, "
          "l'assignation est suspecte (voir QA_REPORT.md).")
md.append("| bâtiment | emprise NavVis m² | +0 (inside) n/Σ | +1 (inside) n/Σ | +1 incl. non-inside |")
md.append("|---|--:|--:|--:|--:|")
for b in ["Aile Ouest","Aile Sud-Est","Atelier","Chapelle","Maison principale"]:
    gi=summ_in.get((b,"+0"),[0,0.0]); fi=summ_in.get((b,"+1"),[0,0.0])
    fall=summ.get((b,"+1"),[0,0.0])
    flag=" ⚠️" if fall[1]>foot[b]+0.5 else ""
    incl=f"{fall[0]} / {fall[1]:.1f}{flag}" if abs(fall[1]-fi[1])>0.05 else "—"
    md.append(f"| {b} | {foot[b]} | {gi[0]} / {gi[1]:.1f} | {fi[0]} / {fi[1]:.1f} | {incl} |")
if unverified:
    md.append("\n**Pièces à assignation NON vérifiée (hors emprise):** " +
              ", ".join(f"{r['id']} ({r['area_m2']} m², {r['building']}?, dist {r['dist_m']} m)" for r in unverified))
tot=sum(r['area_m2'] or 0 for r in enriched)
g0=sum(r['area_m2'] or 0 for r in enriched if r['floor']=='+0')
g1=sum(r['area_m2'] or 0 for r in enriched if r['floor']=='+1')
md.append(f"\n**Σ 6190 rooms: +0 = {g0:.1f} m² · +1 = {g1:.1f} m² · total = {tot:.1f} m²** (45 rooms)")

# ---- B. PDF lot table ----
md.append("\n## B. Architect PDF surface table — LOTS (approximate, authoritative for layout)")
md.append("| lot | +0 | +1 | +2 | terr | total | type |")
md.append("|---|--:|--:|--:|--:|--:|---|")
lt=facts["pdf_lot_table"]
with open(os.path.join(OUT,"areas_pdf_lots.csv"),"w",newline="") as fp:
    w=csv.writer(fp); w.writerow(["lot","+0","+1","+2","terr","total"])
    for k in [x for x in lt if x not in ("total",)]:
        v=lt[k]; row=[k,v.get("+0",""),v.get("+1",""),v.get("+2",""),v.get("terr",""),v.get("tot","")]
        w.writerow(row)
        md.append(f"| {k} | {v.get('+0','')} | {v.get('+1','')} | {v.get('+2','')} | {v.get('terr','')} | {v.get('tot','')} | |")
md.append(f"\n**Σ lots (PDF) = {lt['total']} m²**")

# ---- C. ateliers ----
md.append("\n## C. Architect ateliers (programme)")
at=facts["architect_ateliers"]
md.append("| atelier | m² |\n|---|--:|")
for k,v in at.items():
    if k=="total": continue
    md.append(f"| {k} | {v} |")
md.append(f"\n**Σ ateliers = {at['total']} m²**")

# ---- D. 260608 current labels (to correct) ----
md.append("\n## D. 260608 — étiquettes actuelles (à corriger)")
md.append("| texte | layer |\n|---|---|")
with open(os.path.join(OUT,"labels_260608_current.csv"),"w",newline="") as fp:
    w=csv.writer(fp); w.writerow(["text","x","y","layer"])
    for L in facts["labels_260608"]:
        w.writerow([L["text"],L.get("x"),L.get("y"),L.get("layer")])
        md.append(f"| {L['text']} | {L.get('layer')} |")

open(os.path.join(OUT,"AREAS_consolidated.md"),"w").write("\n".join(md))
json.dump(enriched, open(os.path.join(OUT,"areas_6190_rooms.json"),"w"), indent=1)
print("rooms:",len(enriched)," Σtot=%.1f (+0 %.1f / +1 %.1f)"%(tot,g0,g1))
print("PDF lots total:",lt["total"]," ateliers:",at["total"])
print("wrote:", *sorted(os.listdir(OUT)), sep="\n  ")
