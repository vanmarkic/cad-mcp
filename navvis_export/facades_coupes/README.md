# Façades & coupes — NavVis as-built (vertical orthophotos)

Generated with the SAME `pointcloud/crop` renderer as the floor plans, but with the box rotated so
the image plane is **vertical** (box-Y → world Z height). Georeferenced, site coordinates, colored.
No point-cloud download/processing needed.

## Façade elevations (`elev_*.tiff`, previews in `preview/`, `CONTACT_facades.png`)
Two principal elevations per building: `_NS` (projected along site Y) and `_EW` (along site X).
Full building depth projected → exterior face + silhouette. Coverage 70–97 %. z-window −1.5 … 13 m.

## Coupes / vertical sections (`coupe_*transv*.tiff`, `CONTACT_coupes.png`)
Transverse sections through each main wing. `*_transv2` = 2.5 m-thick slab (denser, usable);
`coupe_MaisonPrinc_transv` = 0.6 m (already dense). Show roof truss + both floors + storey heights.
Thin point-cloud slices are inherently sparse — thicker slab = more returns but more depth overlay.

## Façade heights (`facade_heights.csv`)
Roofline height per column, from the exact georef (image row → world Z). Columns:
`ground_z` (grade = lowest floor z_min), `H_eaves` (P60 roofline ≈ gutter), `H_ridge`/`H_max` (P98/max).
⚠️ **H_ridge/H_max are inflated where trees/vegetation rise in front of the wall** — trust `H_eaves`
as the robust gutter height, and read exact ridge heights off the elevation image (it's metric).
Indicative gutter heights: Aile Sud-Est ≈ 11 m, Atelier ≈ 11–13 m, Chapelle ≈ 12 m,
Maison principale ≈ 15.7 m (4 levels), Aile Ouest — tree-contaminated, read off image.

## Reproduce / add views
`POST /api/site/3186889630268293/pointcloud/crop` with `transformation_matrix` = world→[-0.5,0.5]³ box.
- Plan (top-down): box Z = world Z (thin slab at cut height).
- Elevation along Y: row0=worldX, row1=worldZ, row2=worldY(depth).
- Elevation along X: row0=worldY, row1=worldZ, row2=worldX(depth).
- Coupe: same as elevation but small depth (thin slab) at the cut position.
Poll `GET /jobs/{id}` → `job_parameters.signedDownloadUrl`. (Scripts under `../scripts/`, specs in /tmp/cadwork.)

> ⚠️ SUPERSEDED by ../facades_coupes_aligned/ — those are cut along each building's own wall axis (orthographic). This cardinal-axis set is kept for reference only (oblique by 5–16° for 3 of 5 buildings).
