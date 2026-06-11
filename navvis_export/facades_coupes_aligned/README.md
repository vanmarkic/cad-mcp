# Façades & coupes — BUILDING-ALIGNED (corrected, orthographic)

These supersede `../facades_coupes/` (which were cut along site cardinal X/Y). The buildings are
rotated **5–16°** from the site axes (Aile Ouest 15.9°, Aile Sud-Est 15.6°, Maison principale 14.5°,
Atelier 5.1°, Chapelle 4.5°), so cardinal cuts were oblique. Here each crop box is **rotated about Z
to the building's own wall axis** → true orthographic elevations and proper transverse/longitudinal
sections (walls vertical, true thickness, true along-façade widths). z-window −2…15 m.

Per building: `belev_<b>_long` / `_short` (the two principal façades), `bcoupe_<b>_transv` (across
the long axis) / `_longit` (along it). **Aile Sud-Est** (L-shape) gets two per-arm transverse cuts
(`_transv_arm1`, `_transv_arm2`) instead. Previews in `preview/`, contact sheets `CONTACT_*_aligned.png`.

`facade_heights_aligned.csv` — eaves(P60)/ridge(P98) per elevation. ⚠️ Aile Ouest & Maison principale
eaves are tree/ceiling-inflated; trust the others (Aile Sud-Est ≈11 m, Atelier ≈10.4 m, Chapelle ≈12 m)
and read exact ridges off the metric images. Placed at true z-scale in `../ferme_du_temple_ELEVATIONS_m.dxf`.

## Added 2026-06-11 — measured set + persisted specs
- `measured/` — annotated exports **with measurements** (H égout/faîtage/H max, largeurs, TN);
  methodology in `measured/README.md`. DXF twin with DIMENSION entities:
  `../ferme_du_temple_FACADES_COUPES_mesures.dxf` (sidecar `../FACADES_COUPES_mesures_README.md`).
- `aligned_specs.json` — the per-image px↔m georeferencing key (was only in /tmp; now persisted).
  Field reference: `aligned_specs_README.md`. Regenerate it together with any re-rendered TIFF.

## ⚠ 2026-06-12 — heights verification (protocol v2)
`facade_heights_aligned.csv` **eaves values are RETRACTED** (full-depth envelope ≠ façade; P98
vegetation bias — Chapelle faîtage was +2.10 m off). Verified values: `facade_heights_verified.csv`;
protocol + human sign-off: `VERIF_hauteurs.md`; per-image evidence: `measured/verif/`.
