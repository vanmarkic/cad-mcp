# Sidecar — `ferme_du_temple_footprints_local_m.dxf` / `_cm.dxf` / `footprints_local_m.geojson`

The 5 NavVis site-model **building footprints** (exact polygons) + measured emprise areas +
per-storey z-levels. Layers: `NAVVIS-FOOTPRINT`, `NAVVIS-AREA-LABEL`, `NAVVIS-FLOOR-INFO`,
`NAVVIS-NOTES`.

- `_m` = NavVis-local metres (canonical). `_cm` = same ×100, intended for manual overlay on
  `260608` (⚠️ 260608 is a *separate* CAD frame — a similarity fit is still required; not done).
- Source of truth: `raw/api_geometry.json` (`site_model.body[*].scs_polygon`, `area`);
  summary in `buildings_summary.json`.
- Emprise areas are **outer-envelope** measures — never compare to interior-room or
  lot-programme totals (`areas/QA_REPORT.md`).
- Regenerate: `scripts/build_footprints_dxf.py`.
