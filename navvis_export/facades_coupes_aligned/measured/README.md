# Sidecar — `measured/` : façades & coupes MESURÉES (méthodologie)

Annotated exports of the building-aligned as-built set. One sheet per building
(`<Building>_mesures.png`, 4 panels: élévation long/short + coupe transv/longit — Aile Sud-Est:
two per-arm transverse cuts instead) + `CONTACT_mesures.png` (all 5 stacked).
DXF twin with real DIMENSION entities: `../../ferme_du_temple_FACADES_COUPES_mesures.dxf`
(sidecar `../../FACADES_COUPES_mesures_README.md`).
**Document de travail 2026-06-11 — ne pas utiliser pour acte.**

## How each measurement is computed

All from the aligned TIFFs (`../*.tiff`, orthographic point-cloud renders, shared z-window
−2…+15 m, 17 m image height) + `../aligned_specs.json` (px↔m) + the NavVis site model.

| measure | algorithm |
|---|---|
| **px → metres** | vertical: `z = ZHI − (row/h)·17`. horizontal: `x = col/w · width_m` (`width_m` from `aligned_specs.json`; square pixels at `ppm` px/m) |
| **top-of-structure per column** | first row with alpha > 30 (the render is transparent where no points) |
| **H faîtage / H sommet** | max of the 0.5 m-median-smoothed profile of *persistent* column tops (≥5/7 filled px); from `../facade_heights_verified.csv` (protocol v2) |
| **plateaux secondaires** | flat-column mode ≥0.5 m below the max, support ≥25 % — semantics fixed by human sign-off (`../VERIF_hauteurs.md`) |
| **H égout** | **NOT MEASURED — see below** |
| **largeur structure** | (last − first non-empty column) × m/px — extent of *captured structure*, which can be < building length if an end wall is occluded |
| **TN** (terrain naturel) | per building: min `scs_z_min` over storeys (NavVis site model, `raw/api_geometry.json`) |

## Why there is no égout (protocol v2 finding, 2026-06-11)
The renders are FULL-DEPTH orthographic crops: their top silhouette is the **roof envelope**.
Every "plateau" in it is ridge-class (perpendicular ridge / secondary-body ridge / wall crest)
— a gutter line physically cannot appear. The v1 P60 "eaves" values were therefore retracted
(kept in `../facade_heights_aligned.csv` for traceability only). True égout requires thin
façade-plane re-renders (NavVis crop API). Evidence: `verif/*_verif.png` + `../VERIF_hauteurs.md`.

## Reading the flags (left in on purpose)
- **faîtage ≥ … (tronqué)** — the ridge pokes above the render window; the true
  ridge is *higher*. Resolving it = re-render those crops with a taller z-window.
- **TN −2.71 (sous fenêtre)** — Maison principale grade is below the window; brown line clamped
  at −2, the H values still use the true TN.

## Precision / interpretation
- Point cloud ±2–5 cm, but égout/faîtage/H max are **percentile statistics over a ruin** with
  vegetation and broken wall tops → treat as indicative (±10–20 cm class), confirm anything
  legally relevant with the géomètre.
- Heights are **relative to NavVis site z**, *not* DNG/TAW. Datum link: site z ↔ Lambert 2008
  via the NavVis georef (`../../orthophotos/georef.json`); no levelling benchmark was surveyed.
- Coupes are 2.5 m thick slices — interior floor/ceiling lines in them are real cut geometry,
  but **H max measures the envelope**, not interior clear height (Hsp per room: see
  `../../areas/HEIGHTS.md`, source 6190).

## Regenerate
`../../scripts/verify_facade_heights.py` (protocol v2 → verified CSV + verif PNGs) then
`../../scripts/build_measured_facades.py`. Both read only persisted inputs — no /tmp dependencies.
