# Sidecar — `ferme_du_temple_ELEVATIONS_m.dxf`

All **building-aligned façades + coupes** placed at true z-scale (metres): one row per building,
elevation/section images (from `facades_coupes_aligned/*.tiff`) with z-axis, grade & eaves lines,
titles. Source images are orthographic point-cloud renders cut on each building's own wall axis
(buildings are 5–16° off the site axes — see `facades_coupes_aligned/README.md` for the crop-box
recipe and the eaves/ridge caveats; `facade_heights_aligned.csv` for numbers).

- ⚠️ Heights are **relative to NavVis-local z** (site z, not NGB/DNG datum).
- Aile Ouest & Maison principale eaves values are tree/ceiling-inflated — read ridges off the
  metric images instead.
- Regenerate: `scripts/build_aligned_elevations.py` (renders) → `scripts/build_elevations_dxf.py`.
