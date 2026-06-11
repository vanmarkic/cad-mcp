# Sidecar — `aligned_specs.json` (méthodologie / field reference)

Per-image georeferencing of the 20 building-aligned crops (persisted 2026-06-11 from
`/tmp/cadwork/aligned_specs.json`, which was volatile). **This is the px↔m key for every
measurement** made on the aligned TIFFs — without it the images are just pictures.

## Fields (one record per image)
| field | meaning |
|---|---|
| `name` | image stem, e.g. `belev_AileOuest_long` (`belev_` = elevation, `bcoupe_` = section) |
| `kind` | `elev` or `coupe` |
| `ppm` | pixels per metre (square pixels; render resolution of the crop) |
| `w`, `h` | image size in px. Invariant: `h / ppm = 17` (the shared z-window −2…+15 m) |
| `width_m` | image width in metres = `w / ppm` — horizontal px→m scale |
| `matrix` | the 4×4 **world→box transformation_matrix** sent to the NavVis `pointcloud/crop` job: rotates the crop box about Z onto the building's own wall axis (`angle`) so the render is a true orthographic elevation/section. Recipe: `../facades_coupes/README.md` |
| `angle` | building wall-axis rotation from site axes (°): Aile Ouest 15.9, Aile Sud-Est 15.6, Maison principale 14.5, Atelier 5.1, Chapelle 4.5 |

## How it was produced
`scripts/build_aligned_elevations.py` constructs each crop box (building footprint extent along
its own axes, z −2…+15, coupes = 2.5 m thick slice), submits the NavVis crop job, and records
the spec used. The same script derives `facade_heights_aligned.csv` from the rendered TIFFs.

## Consumers
- `scripts/build_elevations_dxf.py` → `../ferme_du_temple_ELEVATIONS_m.dxf` (image placement)
- `scripts/build_measured_facades.py` → `../ferme_du_temple_FACADES_COUPES_mesures.dxf` +
  `measured/` (all dimensions; uses `width_m`/`ppm` for the horizontal scale)

⚠️ If any TIFF is re-rendered (e.g. taller z-window to un-clip the Aile Ouest / Maison
principale ridges), regenerate this file with it — sizes/ppm change, and the `h/ppm = 17`
invariant becomes `h/ppm = new window height`.
