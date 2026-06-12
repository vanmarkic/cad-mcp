# Façades EXTÉRIEURES — orthographic, from outside inward (as-built NavVis)

**Draft / work in progress (2026-06-12).** Exterior elevations of the complex's **outward**
(countryside-facing) walls, rendered orthographically *from outside looking in* — the counterpart
to the existing full-depth `facades_coupes_aligned/belev_*` (which collapse the whole building
depth and so read as see-through envelopes). Here each image is a **thin slab taken at the outer
wall surface**, viewed from outside, so it reads as a photo of that one face.

⚠️ **Honest coverage caveat — read before using.** The NavVis scan is an **indoor / courtyard
walk**. The best-covered surfaces are the *courtyard-facing* and *interior* faces; the **true
outer faces of the perimeter walls are only partially captured**, and the site is a **roofless,
overgrown ruin**. So these exterior renders range from *good* to *unusable* depending on whether
the scanner ever saw that outer face. **This is faithful as-built data, not retouched** — nothing
is invented; sparse/missing regions are genuinely un-scanned. Not for measurement or for the act;
illustrative only, pending géomètre/architecte review.

## Method (fully reproducible)
1. **Point cloud** — POTREE2 octrees `octree_8729.bin` (Aile Sud-Est) + `octree_8730.bin` (the four
   other buildings), already downloaded to `/tmp/poc/` (re-fetch with
   `scripts/dl_octree.sh` + the IVION creds in `../ACCESS.md` if purged).
2. **Decode** — `scripts/decode_rgb.py`: POTREE2 BROTLI decoder **with RGB** (position 16 B/pt +
   colour 8 B/pt, ported from potree `DecoderWorker_brotli.js`). Returns world-m XYZ + uint8 RGB.
3. **Enumerate outward faces** — `scripts/facade_enum.py`: union the 5 footprints; the central
   **courtyard** is the largest empty region of `convex_hull − union` (the court is an *open*
   horseshoe, not a topological hole). A wall is **outward** when the air just outside it is open
   countryside (not the court, not another building). → `facades_outward.json` + `outward_facades_plan.png`.
4. **Render** — `scripts/render_facades.py`: per façade, gather wall-column points from **both**
   datasets, auto-detect the **dominant scanned wall plane** `d*` (the footprint line is offset
   from the real surface by up to ~3 m), keep a slab `[d*−1.6, d*+0.5] m`, view orthographically
   from outside (painter order: outermost points on top), colour by RGB, splat 2 px, robust z-top
   ("persistent column tops", vegetation-resistant). 1.5 cm/px. No colour manipulation.

## Files
- `belev_ext_<Building>_<side>.tiff` — RGBA, transparent background, 1.5 cm/px. **Only the
  façades with real content are shipped** (tiers A+B below).
- `preview/<…>.png` — white-bg preview of **every** attempted façade (incl. the empty ones, so the
  coverage picture is honest). `CONTACT_facades_ext.png` — tiered contact sheet.
- `facades_ext_specs.json` — px↔m georef key per image (mirrors `../facades_coupes_aligned/aligned_specs.json`):
  `ppm`, `w/h`, `width_m`, `z_min/z_max`, `wall_plane_d`, `normal`, `along`, `end0/end1`, `n_points`,
  `pixel_fill`, `coverage`.
- `outward_facades_plan.png` — plan: green = outward faces + view arrows, red = courtyard.

## Per-façade coverage (tier = how usable the OUTER face is)
| façade | width | fill | tier | note |
|---|---|---|---|---|
| `AileSud-Est_S` | 36.6 m | 33 % | **A** | south wall readable; vegetation along the top |
| `Chapelle_E` | 13.8 m | 25 % | **A** | east gable + pyramidal roof captured |
| `AileSud-Est_E` | 29.7 m | 14 % | **A–** | east wall partial; tall vegetation on the right |
| `AileOuest_S2` | 14.0 m | 29 % | **B** | reads more as interior than outer skin |
| `AileOuest_N2` | 20.2 m | 18 % | **B** | partial; interior structure visible |
| `AileOuest_W2` | 44.6 m | 9 % | **B** | long west wall — mostly **interior roof trusses** show through (outer face barely scanned) |
| `Atelier_E2` | 10.6 m | 12 % | **B** | small east return, partial |
| `AileOuest_S1 / N1 / W1` | — | ~0 % | **C** | south-foot wing: essentially **not scanned** — not shipped |
| `Atelier_N2` | 34.5 m | 4 % | **C** | long north wall: almost no outer-face points — not shipped |
| `Maisonprincipale_N` | 13.5 m | — | **C** | **no points** at this outer face — not shipped |

**Takeaway:** only the south/east sides of **Aile Sud-Est** and the east of **Chapelle** give a
genuinely useful outer-face elevation. The north/west perimeter (Aile Ouest west & foot, Atelier
north, Maison principale north) was not reachable by an indoor scan → those outward façades cannot
be produced from this data. The *courtyard-facing* faces are better scanned (see report) if those
would also be useful.

## Regenerate
```
cd /tmp/poc                                   # where the octree_*.bin live
PYTHONPATH=. /Users/dragan/Documents/cad-mcp/.venv/bin/python \
  /Users/dragan/Documents/cad-mcp/navvis_export/scripts/facade_enum.py        # outward set + plan
PYTHONPATH=. /Users/dragan/Documents/cad-mcp/.venv/bin/python \
  /Users/dragan/Documents/cad-mcp/navvis_export/scripts/render_facades.py     # all façades
# WHICH=inward facade_enum.py  → courtyard faces instead of outward
```
