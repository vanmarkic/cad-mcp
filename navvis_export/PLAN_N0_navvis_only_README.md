# Sidecar — `ferme_du_temple_PLAN_N0_navvis_only.dxf`

**Floor plan +0, 100 % NavVis-derived. No 6190 (Albert), no architect DWG, no PDF.**
Document de travail (2026-06-11) — état EXISTANT (ruine sans toiture) — **ne pas utiliser pour acte**.

## Purpose
A single-source plan: everything in it is measured by the scan. Use when a "what does the
scan alone say" view is needed (e.g. to argue a dimension independently of the surveyor
or the design).

## Frame & units
NavVis-local **metres** (`$INSUNITS=6`); +Y = Lambert 2008 grid north
(6190/Lambert = local + (117027.344, 121045.953) — pure translation, no rotation).
⚠️ Keep **inside `navvis_export/`** (relative orthophoto paths). Stacks 1:1 with
`ferme_du_temple_OVERLAY_6190_navvis.dxf` in the same frame.

## Layers
| layer | content |
|---|---|
| `NAVVIS-MURS-0` | walls vectorized from the point cloud at the +0 cut (±2–5 cm), 112 segments |
| `NAVVIS-EMPRISE` | 5 building footprints (site model), dashed blue |
| `NAVVIS-LABELS` | building name + measured emprise m² |
| `NAVVIS-PLAN-0` | georeferenced orthophoto underlays |
| `NAVVIS-NUAGE-0` | 24 000 sub-sampled scan points (evidence) — **OFF by default** |
| `REPERES` | north arrow (+Y), 10 m scale bar |
| `NOTES` | provenance + disclaimer |

## Method
- Walls/nuage re-used from `ferme_du_temple_ASBUILT_N0_N1.dxf` (see `ASBUILT_PLAN_README.md`
  for the full pipeline: octree download → BROTLI decode → slice +0.85…1.35 m → occupancy
  raster → Hough → axis-snap), transformed cm 6190-frame → /100 − O → NavVis-local m.
- Emprises + areas straight from `raw/api_geometry.json` (site model).
- Ortho IMAGE placement from the `.pgw` world files. ezdxf audit: 0 errors.

## Honest limitations (inherited from the scan)
- Vector walls exist only where the ruin still has walls at cut height — the orthophoto
  underlay carries the rest of the evidence. Denser extraction possible by re-running the
  pipeline with a lower cut / looser denoising (`scripts/wall_lines.py`).
- **Maison principale**: interior not captured at +0 → emprise only.

## Regenerate
```
cd /Users/dragan/Documents/cad-mcp
./.venv/bin/python navvis_export/scripts/build_plan_N0_navvis_only.py
```
