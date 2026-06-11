# Sidecar — `ferme_du_temple_OVERLAY_6190_navvis.dxf`

**Superposition NavVis (existant, scan) × plan 6190 (Immo-Géo / Jonathan Albert).**
Document de travail (2026-06-11, rev. B recalage ICP) — **ne pas utiliser pour acte**.

## Purpose
Visual cross-check of the surveyor's measured plan against the as-built scan, per floor,
in one toggleable DXF. EXISTANT vs EXISTANT only — the architect's design (`260608`/PDF) is
deliberately **not** in this file (that comparison needs a similarity fit, see
`../docs/FINDINGS_design_vs_asbuilt.md`).

## Frame & units
NavVis-local **metres** (`$INSUNITS=6`); +Y = Lambert 2008 grid north.
`6190/Lambert = NavVis-local + (117027.344, 121045.953)` (Lambert 2008 − 500 000).
⚠️ Keep the file **inside `navvis_export/`** — orthophoto IMAGE paths are relative
(`orthophotos/underlay/…`).

## Layers
| layer | content | source |
|---|---|---|
| `NAVVIS-PLAN-0/1` | orthophoto underlays (georeferenced) | NavVis scan |
| `NAVVIS-MURS-0/1` | as-built walls (white / cyan) | NavVis point-cloud vectorization |
| `NAVVIS-FOOTPRINT`, `NAVVIS-ROOM-*` | emprises; room markers inherited from base file | NavVis / 6190 |
| `6190-PLAN-0/1` | building linework (red / magenta) | 6190 `Batiment`, `Contour bâtiment`, `Mur` |
| `6190-AIRES-0/1` | the 45 `Aire:` labels, prefixed **G1–G25 / F1–F20** | 6190 `Légende` + `areas/areas_6190_rooms.json` ids |
| `6190-COTES-0/1`, `6190-LIMITE` | dimension texts; property limit | 6190 |
| `OVERLAY-NOTES` | provenance + transforms + disclaimer | — |

Toggle `…-0` vs `…-1` to switch floors (e.g. in QCAD).

## Method
1. Base = `ferme_du_temple_PLANS_navvis_local_m.dxf` (ortho IMAGEs already placed).
2. NavVis walls imported from `ferme_du_temple_ASBUILT_N0_N1.dxf` (cm 6190-frame → /100 − O).
3. 6190 entities windowed per sheet (±80 m around each sheet origin; the +1 plan is drawn
   **+3205.5 m in X** on the survey sheet), then transformed with the **ICP-refit** per-sheet
   transforms — see `areas/transform_sheet_refit_icp.json` (sol: rot 0.003°, d=(+5.960, −3.136),
   rms70 0.64 m; étage: rot 0.334°, d=(−3.023, −3.073), rms70 0.46 m).
4. Aire-label **id matching** intentionally used the *old 2026-06-09* transform (the frame
   `areas_6190_rooms.json` nx/ny were computed in); **placement** uses the refit transform.
   45/45 matched. ezdxf audit: 0 errors.

## Validation
Refit validated visually against orthophotos (decisive test):
`../reference/diag_transform_refit_N{0,1}_old_vs_new.png`. The original 2026-06-09 transform
was off ~2.5–3 m (+1 rotation 1.5° spurious) — found by the user as "general misalignment".

## Caveats
- F1 (161.36 m²) renders as a detached rectangle outside every footprint at +1 — consistent
  with the standing `areas/QA_REPORT.md` mis-assignment flag. Not a bug; do not "fix" silently.
- NavVis walls sparse at +1 (roofless ruin); Maison principale interior not captured.
- `areas_6190_rooms.json` nx/ny still carry the OLD transform (see json sidecar).

## Regenerate
```
cd /Users/dragan/Documents/cad-mcp
./.venv/bin/python navvis_export/scripts/build_overlay_6190_navvis.py
./.venv/bin/python navvis_export/scripts/render_overlay_png.py   # -> reference/overlay_6190_navvis_N{0,1}.png
```
