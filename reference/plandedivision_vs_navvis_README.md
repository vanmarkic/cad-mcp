# Sidecar — Plan de division (projet) × orthophoto NavVis (existant) · lots L1–L13

**Files / fichiers**

| file | what · quoi |
|---|---|
| `plandedivision_vs_navvis_N0.png` / `.pdf` | niveau **+0** (rez-de-chaussée) — lots **L1–L9** (+ prof. libérale) |
| `plandedivision_vs_navvis_N1.png` / `.pdf` | niveau **+1** (étage) — lots **L1, L2, L3, L5, L6, L7, L8, L10–L13** |
| `plandedivision_vs_navvis_meta.json` | transform + divergence stats (machine-readable) |

Rendered 2026-06-26. **Document de travail — ne pas utiliser pour acte.**

---

## EN — Method

**Goal: expose divergence, not hide it.** These plates lay the architect *plan de division*
(the **design / projet**, lots L1–L13) over the NavVis 3D-scan orthophoto (the **as-built / existant**
roofless ruin) so the differences between the two are directly readable.

**No fitting.** The design is **not** snapped, scaled, warped, or rotated onto the scan. The only
operation is a **single rigid registration by translation** (rotation 0°, scale 1:1) that brings the
architect CAD origin onto the NavVis-local metric frame. Because nothing but a global XY offset is
applied, **every rotational, shape and wall-position divergence between projet and existant remains
visible**. A best-fit (ICP) would have absorbed those differences into a rotation/scale and made the
design look more correct than it is — deliberately avoided here.

**Registration.** The architect DWGs are cm in a near-Lambert CAD frame; N+0 and N+1 share the
*identical* frame, so **one** translation serves both floors. It is fixed from the **ground floor**
(most complete geometry, best design/as-built agreement) as the gross XY offset minimising the median
nearest-as-built wall distance, then reused unchanged for +1.

> `nav_xy_m = xy_architect_cm / 100 + T`,  **T = (−117090.843, −120972.703) m**,  rotation 0°, scale 1.

**What you see.** Grey = orthophoto (as-built). Black lines = NavVis scan walls (as-built). Coloured
lines = architect design walls, **coloured by their distance to the as-built linework** (green ≈
match → red = diverges, scale 0–1 m). Filled polygons = the `Oppervlakte-netto` net-area of each lot,
labelled `L# / area m²`.

**Divergence (design wall → nearest as-built wall), translation-only placement:**

| floor | median | p90 | max | share > 0.3 m |
|---|---|---|---|---|
| +0 | 0.11 m | 0.34 m | 1.06 m | 15 % |
| +1 | 0.13 m | 0.25 m | 0.72 m | 8 % |

The bulk of the envelope agrees to ~10–13 cm; residual peaks (up to ~1 m) are the genuine
design-vs-as-built differences of the renovation (e.g. the L1 wing elbow the design straightens —
see `docs/FINDINGS_design_vs_asbuilt.md`), **not** registration error.

**Caveats.** Working document. Areas are the architect's net values, transcribed as-is — **never
recomputed or guessed**. Lot/area values remain to be confirmed by the géomètre / architecte.

---

## FR — Méthodologie

**But : révéler les écarts, pas les masquer.** Ces planches superposent le *plan de division* de
l'architecte (le **projet**, lots L1–L13) sur l'orthophoto issue du scan 3D NavVis (l'**existant** —
la ruine sans toiture) afin que les différences entre les deux soient directement lisibles.

**Aucun ajustement.** Le projet n'est **ni** calé, **ni** mis à l'échelle, **ni** déformé, **ni**
tourné sur le scan. La seule opération est un **recalage rigide par translation** (rotation 0°,
échelle 1:1) qui amène l'origine du dessin CAO de l'architecte dans le repère métrique NavVis-local.
Comme seul un décalage XY global est appliqué, **tous les écarts d'orientation, de forme et de
position de murs entre projet et existant restent visibles**. Un recalage optimal (ICP) aurait
absorbé ces différences dans une rotation/échelle et fait paraître le projet plus juste qu'il ne
l'est — ce qui est volontairement évité ici.

**Recalage.** Les DWG architecte sont en cm dans un repère CAO proche-Lambert ; N+0 et N+1 partagent
le repère *identique*, donc **une seule** translation sert les deux niveaux. Elle est fixée depuis le
**rez-de-chaussée** (géométrie la plus complète, meilleur accord projet/existant) comme le décalage
XY minimisant la distance médiane au mur existant le plus proche, puis réutilisée telle quelle au +1.

> `nav_xy_m = xy_architecte_cm / 100 + T`,  **T = (−117090,843 ; −120972,703) m**,  rotation 0°, échelle 1.

**Lecture.** Gris = orthophoto (existant). Lignes noires = murs scan NavVis (existant). Lignes
colorées = murs du projet architecte, **colorées selon leur distance au tracé existant** (vert ≈
concordance → rouge = écart, échelle 0–1 m). Polygones remplis = surface nette `Oppervlakte-netto`
de chaque lot, étiquetée `L# / surface m²`.

**Écart (mur projet → mur existant le plus proche), recalage par translation seule :**

| niveau | médiane | p90 | max | part > 0,3 m |
|---|---|---|---|---|
| +0 | 0,11 m | 0,34 m | 1,06 m | 15 % |
| +1 | 0,13 m | 0,25 m | 0,72 m | 8 % |

L'essentiel de l'enveloppe concorde à ~10–13 cm ; les pics résiduels (jusqu'à ~1 m) sont les
véritables différences projet/existant de la rénovation (p. ex. le coude de l'aile L1 que le projet
redresse — voir `docs/FINDINGS_design_vs_asbuilt.md`), et **non** une erreur de recalage.

**Réserves.** Document de travail. Les surfaces sont les valeurs nettes de l'architecte, reprises
telles quelles — **jamais recalculées ni devinées**. Les valeurs de lots/surfaces restent à
confirmer par le géomètre / l'architecte.

---

## Sources & regenerate

- Plan de division : `plan_de_division_2026_06_12/260612_plansdedivision_archi-dwg/{N +0,N +1}.dwg`
  (architecte, Vectorworks, cm) — lots on `Oppervlakte-netto`, labels on `Tekst-beschrijving`,
  walls on `Bestaand-4 massa` / `_Nieuw-4 massa` / `Batiment`.
- Orthophoto : `navvis_export/orthophotos/underlay/plan_*_{0,1}.png` (+ `.pgw`), NavVis-local m.
- As-built linework : `navvis_export/ferme_du_temple_OVERLAY_6190_navvis.dxf`
  (`NAVVIS-MURS-{0,1}` scan walls + `6190-PLAN-{0,1}` géomètre Albert).

```
./.venv/bin/python navvis_export/scripts/build_plandedivision_overlay.py
```
