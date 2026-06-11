# .nvr gridmap format (reverse-engineered)
- Header: 4 bytes "NVR\x01"
- Then N concatenated standard PNG tiles (256x256 RGBA, 8-bit), back-to-back
  (tile[i+1] begins immediately after tile[i] IEND+CRC). No per-tile index.
- maps-46926.nvr (Chapelle floor 0): 5.74 MB, 69 PNG tiles. map_size_m=20.48, max_depth=3.
- Tile placement order = NavVis quadtree (field `quadtree` hex per tiled_map). Not a flat
  presence bitmap (popcount(104b)=62, first-85=50; file has 69 tiles) -> ordering still TBD.
- One .nvr per storey at maps/building_<bid>/maps-<floor_id>.nvr
- => per-storey TOP-DOWN floor-plan rasters are recoverable as PNG, but mosaicing needs the
  quadtree decode. Top-down only: gives interior walls, NOT facade heights or sections.
