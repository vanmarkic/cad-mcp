# Sidecar — `ferme_du_temple_PLANS_navvis_local_m.dxf`

As-built floor-plan workspace: the 10 **orthophoto underlays** (IMAGE entities, layers
`NAVVIS-PLAN-0/1`) + footprints (`NAVVIS-FOOTPRINT`) + 6190 room markers (`NAVVIS-ROOM-0/1`,
⚠️ positions carry the OLD 2026-06-09 transform) + empty `LOT-TRACE-*` layers for tracing lots.

- Frame: NavVis-local **m** (`$INSUNITS=6`). Keep inside `navvis_export/` (relative image paths).
- Image placement from `orthophotos/underlay/*.pgw` world files (centre-of-pixel convention).
- Served as the **base** for `ferme_du_temple_OVERLAY_6190_navvis.dxf` (which adds scan walls +
  6190 linework with the ICP-refit transforms — prefer that file for cross-checking).
- Regenerate: `scripts/build_floorplan_dxf.py`.
