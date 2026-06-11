# Plan as-built NavVis — `ferme_du_temple_ASBUILT_N0_N1.dxf`

A **brand-new** floor plan of the Ferme du Temple (niveaux **+0** and **+1**), built **only**
from the NavVis IVION 3-D point cloud — no architect DWG, no surveyor 6190, no PDF. As-built
(EXISTANT) state of the roofless ruin. Structured like `260608_FermeduTemple.dwg` (cm units,
`Bestaand-…` layer vocabulary) but cleaner: tight extents, real per-floor geometry on separate
toggleable layers, measured areas, georeferenced, provenance note + north arrow + scale bar.

## How it was made (fully reproducible — `scripts/`)
1. **Auth**: `POST /api/auth/generate_tokens` (creds in `ACCESS.md`) → access token. The account has
   `CAN_CROP_AND_DOWNLOAD_POINT_CLOUD`.
2. **Locate cloud**: 2 POTREE2 datasets (8729 = Aile Sud-Est; 8730 = the 4 others). Signed CDN URL via
   `POST /api/site/<id>/storage/download/prefix/signed/url` body `{"prefix_in_site": "<dataset prefix>"}`.
   Octree files at `<prefix>/cloud/{metadata.json,hierarchy.bin,octree.bin}`. → `dl_octree.sh`.
3. **Decode** (`decode_potree2.py`): octree is **BROTLI**-encoded with morton-packed positions.
   Decoder ported verbatim from Potree 2.0 `DecoderWorker_brotli.js` (vectorized numpy). Hierarchy
   parser validated: Σ node points = 63 688 169 (8729) exactly. Decoder validated: 100 % of points
   inside the metadata bounding box.
4. **Slice** (`decode_slices.py`): per (building, floor) keep points within the building **emprise**
   (site_model footprint) and the storey Z band. → `slices/<building>_<floor>.npy` (NavVis-local m).
5. **Vectorize** (`wall_lines.py`): thin architectural cut at **floor+0.85…1.35 m** (floor = robust
   low-percentile z, handles uneven rubble floors) → 2.5 cm occupancy raster → denoise (drop compact
   debris, keep elongated wall-like components) → skeleton → probabilistic **Hough** line segments →
   **snap** to each building's 2 dominant axes → merge collinear → clean straight wall lines
   (LINE entities). Out-of-square geometry within ±20° of the axes is preserved.
6. **Assemble** (`build_dxf.py`): transform to frame, write DXF.

## Coordinate frame & units
- **Units = cm** (`$INSUNITS = 5`).
- **Frame = surveyor 6190 frame**: `xy_cm = (NavVis-local_m + (117027.344, 121045.953)) × 100`.
  To get **EPSG:8370 (Belgian Lambert 2008)** metres: `/100`, then add `(500000, 500000)` →
  i.e. local + (617027.344, 621045.953) m (NavVis SITE affine). Z is relative (local ×100).
- Exact overlay on `260608` (design) still needs a **similarity fit** (260608 is a rotated CAD frame;
  see `../docs/FINDINGS_design_vs_asbuilt.md`).

## Layers
| Layer | Content |
|---|---|
| `0-NAVVIS-emprise` | exact building footprints (NavVis site_model), bleu |
| `Bestaand-murs-N0` / `-N1` | as-built wall faces, niveau +0 (blanc) / +1 (cyan) |
| `Bestaand-nuage-N0` / `-N1` | sub-sampled raw scan points (evidence), **éteints** par défaut |
| `Tekst-ruimtelabel` | nom bâtiment + emprise mesurée + hauteurs d'étage (NavVis) |
| `NAVVIS-notes`, `Reperes` | note de provenance ; flèche Nord + échelle |

## ⚠️ Caveats (legal/cadastral)
- These are **as-built measurements** of a ruin, not legal areas. Walls are **extracted from the
  scan** (≈ ±2–5 cm) as straight centre-line segments **snapped to each building's dominant axes**
  (orthogonal walls regularised; genuinely oblique walls within ±20° kept). They are single lines,
  not double-face poché — request poché/thickness if needed.
- **Maison principale**: interior at +0/+1 was **not captured** by the scan at wall height →
  **emprise only**. Re-scan or a targeted crop needed for its plan.
- **+1** is sparser than **+0** (upper walls broken/missing in the roofless ruin) — honest.
- Open halls (e.g. Chapelle nave) correctly show few interior walls; the perimeter is the emprise.

## Regenerate
```
cd navvis_export/scripts
zsh dl_octree.sh "datasets_web/676b2bec-451d-4705-8819-07756bdca997=2026-06-04_13.53.03" /tmp/poc/octree_8729.bin
zsh dl_octree.sh "datasets_web/65895e0e-bfb1-4551-9e77-c7409d02e629=2026-06-04_12.53.01" /tmp/poc/octree_8730.bin
python decode_slices.py            # -> /tmp/poc/slices/*.npy
python build_dxf.py                # -> ferme_du_temple_ASBUILT_N0_N1.dxf
```
Preview renders: `../reference/asbuilt_navvis_N0_N1.png`, `..._AileOuest_closeup.png`.
