# STATUS — NavVis Ferme du Temple extraction (2026-06-11)

## DONE / SOLID (delivered, each DXF with sidecar `*_README.md`)
- Credentials + API auth reverse-engineered (ACCESS.md); site_model: 5 footprints + emprises
  + storey z-levels, georef EPSG:8370 (`raw/api_geometry.json`, `buildings_summary.json`).
- **Point cloud fully decoded** (POTREE2 octrees, BROTLI; 63.7 M pts validated) →
  `ferme_du_temple_ASBUILT_N0_N1.dxf` (as-built walls +0/+1, cm, 6190 frame).
- **Orthophotos**: 10 georeferenced floor-plan TIFFs + PNG underlays + world files
  (`orthophotos/`, `georef.json`); measurement grids in `plans_measure/`.
- **Façades & coupes**: building-aligned orthographic set (`facades_coupes_aligned/`)
  + `ferme_du_temple_ELEVATIONS_m.dxf` at true z-scale. Cardinal-axis set superseded.
- **Measured façades & coupes** (2026-06-11): `ferme_du_temple_FACADES_COUPES_mesures.dxf`
  (DIMENSION entities: H égout/faîtage/H max + largeurs structure; flags for inflated eaves /
  z-clipped ridges) + annotated PNGs in `facades_coupes_aligned/measured/`. Specs persisted to
  `facades_coupes_aligned/aligned_specs.json`.
- **Areas & heights**: `areas/` (45 rooms 6190, NavVis emprises, PDF lots, 260608 labels,
  HEIGHTS, adversarial QA_REPORT).
- **Overlay NavVis × 6190**: `ferme_du_temple_OVERLAY_6190_navvis.dxf` + PNGs in
  `../reference/` — per-sheet transforms **refit by ICP 2026-06-11**
  (`areas/transform_sheet_refit_icp.json`; old 2026-06-09 fit superseded, was ~2.5–3 m off).
- **NavVis-only plan +0**: `ferme_du_temple_PLAN_N0_navvis_only.dxf`.
- Site plans A1: `site_plans.pdf` (+ per-floor).

## OPEN
- Re-check 6190 room→building assignment with the refit transform (F1 «Grenier» flag,
  edge rooms) — `areas/transform_sheet_refit_icp_README.md`.
- Maison principale interior not captured at wall height (emprise only) → re-scan or
  targeted crop if its plan is needed.
- Design-vs-as-built (260608 ↔ scan) similarity fit not done — `../docs/FINDINGS_design_vs_asbuilt.md`.
- Coupes per Jordy's 2026-05-29 wish (two short building sections instead of one long one,
  locations in his mail attachment) — material exists in `facades_coupes_aligned/`; cutting
  bespoke sections from the cloud is feasible (`scripts/decode_slices.py` pipeline). Parked.

## Scripts (`scripts/`, all rerunnable from repo root with ./.venv)
Pipeline: `dl_octree.sh` → `decode_potree2.py`/`decode_slices.py` → `wall_lines.py` →
`build_dxf.py`. Plans/elevations: `build_floorplan_dxf.py`, `build_aligned_elevations.py`,
`build_elevations_dxf.py`, `build_footprints_dxf.py`, `build_site_plan_pdfs.py`.
Areas: `consolidate_areas.py` (⚠️ reads /tmp/cadwork inputs + OLD transform).
Overlay/refit (2026-06-11): `refit_6190_transforms.py`, `validate_new_transforms.py`,
`diag_old_vs_new.py`, `build_overlay_6190_navvis.py`, `render_overlay_png.py`,
`build_plan_N0_navvis_only.py`.
