# Sidecar — overlay & diagnostic PNGs (NavVis × 6190)

All rendered 2026-06-11 from `navvis_export/ferme_du_temple_OVERLAY_6190_navvis.dxf`
(rev. B, ICP-refit transforms). Documents de travail — ne pas utiliser pour acte.

| file | what |
|---|---|
| `overlay_6190_navvis_N0.png` | niveau +0 — NOIR: murs NavVis (scan) · ROUGE: plan 6190 Immo-Géo (J. Albert) with `Gxx: area m²` chips · fond: orthophoto |
| `overlay_6190_navvis_N1.png` | same, niveau +1 (`Fxx` labels). F1 deliberately floats off-building (QA flag, see `navvis_export/areas/QA_REPORT.md`) |
| `diag_transform_refit_N0_old_vs_new.png` | Aile Ouest closeup +0: OLD 2026-06-09 transform (left, ~2.6 m off) vs ICP refit (right) over orthophoto |
| `diag_transform_refit_N1_old_vs_new.png` | same +1: OLD spurious 1.5° rotation (left) vs refit (right) — the misalignment the user reported |

Method + numbers: `navvis_export/areas/transform_sheet_refit_icp_README.md`.
Regenerate: `./.venv/bin/python navvis_export/scripts/render_overlay_png.py`
(diags: `navvis_export/scripts/diag_old_vs_new.py`, written to /tmp/poc, copy as needed).

Older artifacts in this folder (corrected plans, L1 elbow, PDF crops, 6190 room maps…)
are catalogued in `WORKLOG.md` and `CLAUDE.md` (Document map).
