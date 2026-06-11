# Sidecar — `transform_sheet_refit_icp.json`

Per-sheet transforms **6190 (Albert) → NavVis-local m**, refit 2026-06-11.
**Supersedes** the 2026-06-09 `/tmp/cadwork/transform_refined.json` for *placement*.

## Why it exists
The 2026-06-09 transform was accepted on a coarse test (room labels inside footprints) and
turned out to be off **~2.5–3 m** (and the +1 sheet's 1.5° rotation was spurious). Spotted
by the user as a visible misalignment in the overlay; root-caused and refit the same day.

## Method
Trimmed ICP (keep closest 70 %), source = 6190 `Contour bâtiment` polylines densified to
~1 m point spacing (per sheet: ground x<118500; first sheet drawn +3205.5 m in X), target =
NavVis site-model footprint exterior rings. Rotation+translation only, **scale fixed 1.0**
(both sources are metric surveys). Kabsch update per iteration, 22–29 iterations.
Script: `../scripts/refit_6190_transforms.py`; independent checks:
`../scripts/validate_new_transforms.py`, visual `../scripts/diag_old_vs_new.py` →
`../../reference/diag_transform_refit_N{0,1}_old_vs_new.png` (decisive).

## Results (model: `nav = R(rot) @ (xy_6190 − O_sheet) + d`)
| sheet | rot | d (m) | rms70 | median | old rms70 |
|---|---|---|---|---|---|
| ground +0 | 0.003° | (+5.960, −3.136) | **0.64 m** | 0.38 | 1.80 |
| first +1 | 0.334° | (−3.023, −3.073) | **0.46 m** | 0.37 | 2.01 |

## ⚠️ Downstream impact (open)
`areas_6190_rooms.json` **nx/ny still carry the OLD transform**, and so does the
room→building assignment behind `AREAS_consolidated.md` (incl. the F1 «Grenier» flag).
Areas/ids themselves are read verbatim from Albert's labels and are unaffected.
Edge-of-building assignments should be re-checked with this transform before round-2
conclusions. (Consumers that need ids keep matching in the old frame; place in the new.)
