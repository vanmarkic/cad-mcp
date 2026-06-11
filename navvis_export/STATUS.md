# STATUS — NavVis Ferme du Temple extraction

## DONE / SOLID (delivered)
- Credentials + API auth fully reverse-engineered (see ACCESS.md).
- site_model extracted: 5 building footprints (exact polygons) + measured emprise areas
  + per-storey z-levels. Georef EPSG:8370.
- DXF built (vector, exact):
    ferme_du_temple_footprints_local_m.dxf   (meters)
    ferme_du_temple_footprints_local_cm.dxf  (cm; for 260608 overlay)
  Layers: NAVVIS-FOOTPRINT, NAVVIS-AREA-LABEL, NAVVIS-FLOOR-INFO, NAVVIS-NOTES.
- footprints_local_m.geojson, buildings_summary.json.
- Reference sources catalogued (REFERENCE_SOURCES.md): architect DWG link, ImmoGeo 6190, PDF.

## PROVEN FEASIBLE (not yet built)
- Per-storey TOP-DOWN floor-plan rasters: 14 .nvr gridmaps = PNG tile pyramids,
  downloadable via signed CDN URLs. Mosaicing needs quadtree decode. Top-down only.

## NEEDS POINT CLOUD (engine for facade + coupe; best for measurable floor plans)
- 2 datasets (POTREE2), bbox known. Octree on-disk path NOT yet located (lazy-loaded;
  guessed paths 404). Next: capture viewer's cloud requests to find octree URLs, gauge size,
  download, then slice -> floor plans (horizontal), coupe (vertical), facade (projection+heights).

## OPEN DECISION
How far to push (raster floor-plan underlays vs full point-cloud as-built for plan+facade+coupe).
