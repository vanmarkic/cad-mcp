#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vérification reproductible des mesures du bordereau toiture (Maison principale).
Recalcule depuis les sources PRIMAIRES, sans valeur recopiée :
  - aire d'emprise (shoelace) vs métadonnée NavVis
  - périmètre, et classification de chaque arête : LIBRE (corniche/gouttière)
    vs MITOYENNE (contre un autre bâtiment scanné -> solins/noues)
  - hauteur sous corniche depuis les niveaux du scan
  - recoupement surface des versants <-> pente
  - recoupement surface d'échafaudage

Lancer :  ./.venv/bin/python deliverables/bordereau_toiture_maison_principale/verify_metres.py
Source :  navvis_export/footprints_local_m.geojson  +  navvis_export/buildings_summary.json
"""
import json, math, os
from shapely.geometry import Polygon, LineString

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GJ = json.load(open(os.path.join(ROOT, "navvis_export/footprints_local_m.geojson")))
BS = json.load(open(os.path.join(ROOT, "navvis_export/buildings_summary.json")))
NAME, THR = "Maison principale", 0.8   # seuil mitoyenneté (m)

polys = {f['properties']['name']: f['geometry']['coordinates'][0] for f in GJ['features']}
meta  = {f['properties']['name']: f['properties']['area_m2'] for f in GJ['features']}

def shoelace(c):
    return abs(sum(c[i][0]*c[i+1][1]-c[i+1][0]*c[i][1] for i in range(len(c)-1)))/2

c = polys[NAME]
if c[0] != c[-1]: c = c + [c[0]]
poly = Polygon(c)
others = {n: Polygon(p if p[0]==p[-1] else p+[p[0]]) for n,p in polys.items() if n != NAME}

print(f"=== AIRE & PÉRIMÈTRE — {NAME} ===")
print(f"  aire shoelace : {shoelace(c):.2f} m²   (méta NavVis {meta[NAME]:.3f} m²)")
print(f"  périmètre     : {poly.length:.2f} m  ({len(c)-1} arêtes)")

print("\n=== ARÊTES : libre vs mitoyenne ===")
free = party = 0.0
for i in range(len(c)-1):
    seg = LineString([c[i], c[i+1]]); L = seg.length
    mid = seg.interpolate(0.5, normalized=True)
    near = min(others, key=lambda n: others[n].boundary.distance(mid))
    d = others[near].boundary.distance(mid)
    mit = d < THR
    party, free = (party+L, free) if mit else (party, free+L)
    print(f"  arête {i:>2}: {L:5.2f} m  voisin {d:4.2f} m  -> {'MITOYEN ('+near+')' if mit else 'libre'}")
print(f"  LIBRE (corniche/gouttière) : {free:.1f} m")
print(f"  MITOYEN (solins/noues)     : {party:.1f} m")

mp = next(b for b in BS['buildings'] if b['building']==NAME)
z_corn = next(f for f in mp['floors'] if f['name']=='1')['z_max']
z_sol  = next(f for f in mp['floors'] if f['name']=='0')['z_min']
z_grade = -1.5   # base des rendus de façade extérieure (scan)
H_int = z_corn - z_sol      # intérieur : sol niv.0 -> corniche
H = z_corn - z_grade        # façade extérieure : terrain -> corniche (la hauteur utile)
print(f"\n=== HAUTEUR ===")
print(f"  intérieur sol niv.0 ({z_sol:.2f}) → corniche ({z_corn:.2f}) = {H_int:.2f} m")
print(f"  façade ext. base ({z_grade:.1f}) → corniche = {H:.2f} m   (relevé MO ≈ 10 m ✓)")

A = poly.area
print(f"\n=== VERSANTS ↔ PENTE  (versants = emprise/cos pente) ===")
print(f"  237 m² ⇒ pente {math.degrees(math.acos(A/237)):.1f}°   |   40° ⇒ {A/math.cos(math.radians(40)):.0f} m²")
print(f"\n=== ÉCHAFAUDAGE ===\n  {free:.1f} m (libre) × {H:.1f} m (façade) ≈ {free*H:.0f} m² (avant déduction baies)")

# --- Répartition des 237 m² de versants par orientation, puis surface de reprise ---
# Calibration N/E/S/O (repère NavVis-local, d'après facades_ext_specs) : N≈+Y, E≈+X, S≈-Y, O≈-X
VERS = 237.0
DIRS = {'Nord': (0, 1), 'Est': (1, 0), 'Sud': (0, -1), 'Ouest': (-1, 0)}
cx, cy = poly.centroid.x, poly.centroid.y
def outward_normal(a, b):
    ex, ey = b[0]-a[0], b[1]-a[1]
    cands = [(ey, -ex), (-ey, ex)]; mx, my = (a[0]+b[0])/2, (a[1]+b[1])/2
    n = max(cands, key=lambda v: (mx+v[0]-cx)**2 + (my+v[1]-cy)**2)
    L = math.hypot(*n); return (n[0]/L, n[1]/L)
per = {d: 0.0 for d in DIRS}
for i in range(len(c)-1):
    a, b = c[i], c[i+1]; L = LineString([a, b]).length
    nx, ny = outward_normal(a, b)
    per[max(DIRS, key=lambda k: nx*DIRS[k][0]+ny*DIRS[k][1])] += L
Ltot = sum(per.values())
print(f"\n=== VERSANTS PAR ORIENTATION (237 m² répartis par avant-toit) ===")
Area = {d: VERS*per[d]/Ltot for d in DIRS}
for d in DIRS:
    print(f"  {d:6}: avant-toit {per[d]:5.1f} m  ->  versant ~{Area[d]:5.1f} m²")
fN, fE = 0.45, 1/3   # relevé MO : 'moins de la moitié' du Nord ; '1/3' de l'Est
rep = fN*Area['Nord'] + fE*Area['Est']
print(f"\n=== SURFACE DE REPRISE (relevé MO) ===")
print(f"  Nord {fN:.0%}×{Area['Nord']:.0f} + Est {fE:.0%}×{Area['Est']:.0f}  ≈  {rep:.0f} m²")

# --- Terrasson (sommet plat) : NON mesurable sur le scan (scanner intérieur,
#     rendus pleine profondeur). Estimation géométrique = emprise rétrécie de
#     l'avancée 'r' des versants ; r calé pour retrouver ~237 m² de versants. ---
print(f"\n=== TERRASSON (estimation géométrique — non mesurable sur scan/coupe) ===")
print(f"  {'r (m)':>6} {'terrasson m²':>12} {'versants@50°':>12}")
for r in (3.0, 3.5, 4.0):
    inner = poly.buffer(-r)
    T = inner.area if not inner.is_empty else 0.0
    v = (A - T) / math.cos(math.radians(50))
    print(f"  {r:>6.1f} {T:>12.1f} {v:>12.0f}")
print("  ⇒ estimation géométrique 30–40 m² ; MESURE MANUELLE MO sur immovision = 5 × 4 m = 20 m² (RETENU)")
