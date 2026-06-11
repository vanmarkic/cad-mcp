# navvis_export/ — Ferme du Temple, extraction from NavVis IVION + reconciled area sources

Extraction of the NavVis IVION "jumeau numérique" (ImmoPass dossier 12039, scan 2026-06-04) plus
consolidated room/lot **areas** and **heights** from all available sources. Feeds the wider goal of
correcting lot/space areas in `260608_FermeduTemple.dwg` and the plan de division.

## Read me first
- `ACCESS.md` — how the NavVis site + API were accessed (credentials, auth, endpoints).
- `STATUS.md` — what's done / feasible / pending.
- `REFERENCE_SOURCES.md` — the other documents and their authority (architect DWG link, 6190, PDF).

## Areas & heights (readable) — `areas/`
| file | what |
|---|---|
| `areas/AREAS_consolidated.md` | **master human report**: 6190 rooms, PDF lots, ateliers, 260608 current labels |
| `areas/areas_6190_rooms.csv` / `.json` | **45 surveyor rooms** → area, Hsp (clear height), perimeter, floor elevation, NavVis building, floor (+0/+1) |
| `areas/areas_navvis.csv` / `.md` | NavVis 5 **building emprises** + storey volumes/heights (NavVis has NO room areas) |
| `areas/areas_pdf_lots.csv` | architect PDF lot table L1–L13 (approximate) |
| `areas/labels_260608_current.csv` | existing labels in the target DWG (to be corrected) |
| `areas/HEIGHTS.md` + `areas/heights_navvis_storeys.csv` | storey heights (NavVis) + clear ceiling heights (6190 Hsp) |
| `areas/QA_REPORT.md` | adversarial QA of the above (multi-agent verification) |

## Geometry (DXF + data) — each DXF has a sidecar `*_README.md`
| file | what |
|---|---|
| `ferme_du_temple_ASBUILT_N0_N1.dxf` | **as-built plan +0/+1 from the point cloud** (walls, emprises, nuage evidence; cm, 6190 frame) — sidecar `ASBUILT_PLAN_README.md` |
| `ferme_du_temple_OVERLAY_6190_navvis.dxf` | **overlay NavVis × 6190 (Albert)** per floor, ortho underlays, ICP-refit transforms — sidecar `OVERLAY_6190_navvis_README.md` |
| `ferme_du_temple_PLAN_N0_navvis_only.dxf` | **plan +0, 100 % NavVis** (no 6190/architect) — sidecar `PLAN_N0_navvis_only_README.md` |
| `site_plans.pdf` (+ `site_plan_ground.pdf`, `site_plan_first.pdf`) | **printable A1 site plans** (~1:114): whole-farm composite per floor, footprints + 6190 rooms + grid + scale + north |
| `ferme_du_temple_ELEVATIONS_m.dxf` | **aligned elevations + coupes** at true z-scale + z-axis + grade/eaves lines (rebuilt from `facades_coupes_aligned/`) |
| `ferme_du_temple_FACADES_COUPES_mesures.dxf` | **measured** façades & coupes: DIMENSION entities (H égout/faîtage/max, largeurs), niveau lines, 1 m grid — sidecar `FACADES_COUPES_mesures_README.md`; PNG exports in `facades_coupes_aligned/measured/` |
| `ferme_du_temple_PLANS_navvis_local_m.dxf` | **as-built floor plans** (orthophoto underlays) + footprints + 6190 rooms + LOT-TRACE layers |
| `orthophotos/` | 10 georeferenced floor-plan TIFFs (1–2.3 cm/px) + world files + `georef.json` + `VERIFY_*.png` |
| `plans_measure/*.png` | measurement-ready: ortho + 1 m grid + 6190 rooms/areas (trace lots here) |
| `facades_coupes_aligned/` | **building-aligned** elevations + coupes (orthographic, cut on each building's wall axis) + `facade_heights_aligned.csv` — **use these** |
| `facades_coupes/` | original cardinal-axis set (oblique 5–16°) — **superseded**, kept for reference |
| `ferme_du_temple_footprints_local_m.dxf` / `_cm.dxf` | 5 footprints + emprise areas + storey levels (m / cm) |
| `footprints_local_m.geojson`, `buildings_summary.json` | footprints + buildings/floors/z-levels + georef |

## How the as-built geometry was obtained
NavVis `pointcloud/crop` job API (reverse-engineered): `POST /api/site/<id>/pointcloud/crop` with a
world→box `transformation_matrix` → renders a **georeferenced orthophoto** (top-down = floor plan; rotated
box = façade/coupe), poll `GET /jobs/{id}` → signed CDN URL. No point-cloud download needed. See
`facades_coupes/README.md` for the matrix recipe; scripts in `scripts/`.

## Raw / provenance — `raw/`
API dumps (`api_geometry.json`), full network log, one sample gridmap (`maps/`), probes. `screenshots/`.

## Coordinate frames
- NavVis local = **meters**, georef EPSG:8370 (Lambert 2008), site origin E 617027.344 / N 621045.953.
- 6190 = NavVis-local + (117027.344, 121045.953) *nominal*; first-floor sheet drawn +3205.5 in X.
  **Per-sheet precise placement = ICP refit (2026-06-11)**: `areas/transform_sheet_refit_icp.json`
  (+ sidecar). The 2026-06-09 transform is superseded (~2.5–3 m off; +1 rot 1.5° spurious).
- 260608 = cm, separate CAD frame (needs a similarity fit; not done).

## Pending (user's order)
1. ✅ room-level areas → readable files (this folder).
2. ✅ per-storey floor plans + heights (`ASBUILT_N0_N1`, `PLAN_N0_navvis_only`, orthophotos, HEIGHTS).
3. ✅ full point-cloud as-built (octree decoded; see `ASBUILT_PLAN_README.md`) — façades/coupes in
   `facades_coupes_aligned/` + `ferme_du_temple_ELEVATIONS_m.dxf`.
4. ⏳ re-check 6190 room→building assignments with the refit transform (F1 et al., see
   `areas/transform_sheet_refit_icp_README.md`).
