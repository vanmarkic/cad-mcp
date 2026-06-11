# FINDINGS — design vs as-built geometry (handoff for the next agent)

_2026-06-09. From the 260608-correction agent. Companion to `WORKLOG.md`,
`CROSSCHECK_lots.md`, `navvis_export/HANDOFF_to_correction_agent.md`._

## TL;DR
The surface-label correction (areas) is done and shipped. A **separate, geometric** issue
surfaced while reviewing lot **L1**: the building is a **renovation of a roofless / overgrown
ruin**, so the architect plans (`260608`, PDF `260512`) are the **PROJET (design)** while the
NavVis scan + 6190 are the **EXISTANT (as-built)**. They differ in **shape**, not just in finish —
e.g. **L1's existing wing has an elbow (L-shape) that the design straightens into one apartment.**
This does **not** change the surface *numbers* (those are design intent), but it's a real
design-vs-existing discrepancy worth a dedicated pass.

## What I observed (L1, concrete)
- L1 design: +0 = 76 m², +1 = 71 m². Located in the **Aile Ouest NW diagonal arm** (top-left).
- The architect PDF draws L1 as a **straight** room meeting the wing at a square corner.
- The as-built orthophoto of the same spot shows: (a) **vegetation / open-to-sky ruin**, and
  (b) the existing wing **bends — an elbow / L-shape** — at the building's true ~16° rotation.
- 6190 measured **5 small existing rooms** in that wing (G7 19, G9 19, G11 12, G12 13, G14 37 m²,
  all with ceiling heights Hsp ≈ 2.6–3.4 m), which the design merges into the single apartment L1.
- Side-by-side images: `reference/L1_projet_vs_asbuilt.png`, `reference/L1_elbow_compare.png`.

Two effects are tangled and must be separated when comparing:
1. **Orientation** — the orthophotos are true-north; the architect plan is axis-aligned/squared-up.
   Buildings are rotated from site axes: **Aile Ouest 15.9°, Aile Sud-Est 15.6°, Maison principale
   14.5°, Atelier 5.1°, Chapelle 4.5°** (source: `navvis_export/facades_coupes_aligned/README.md`).
2. **Geometry** — beyond rotation, the design simplifies existing walls (the L1 elbow).

## Data & coordinate facts (everything you need)
- Interpreter: `./.venv/bin/python` (ezdxf, shapely, numpy, matplotlib, tifffile, PIL, pymupdf).
  Avoid `/tmp/cadwork` for scripts (stray `struct.py` shadows stdlib) — use `/tmp/poc`.
- **Common frame = Belgian Lambert 2008.** `6190 = NavVis-local + (117027.344, 121045.953)`.
  `260608` is cm in a *separate* CAD frame (≈100 m offset; needs a similarity fit). PDF = page pts.
- **Orthophotos** (as-built, georeferenced GeoTIFFs in **NavVis-local metres**):
  `navvis_export/orthophotos/plan_<building>_<0|1>.tiff` + `georef.json`
  (per plan: `world_xmin/xmax/ymin/ymax`, `m_per_px` ≈ 0.01–0.023). Read pages with
  `tifffile.TiffFile(...).pages[0].asarray()` (plain `imread` chokes on the GeoTIFF tags).
  Pixel→world: `wx = xmin + col*mpp ; wy = ymax − row*mpp`.
- **6190 rooms** with NavVis-local coords + floor + building: `navvis_export/areas/areas_6190_rooms.csv`.
- **NavVis building footprints** (polygons, NavVis-local): `navvis_export/raw/api_geometry.json`
  → `site_model.body[*].scs_polygon`.
- **PDF lot positions** (exact, per floor): `fitz` `doc[6]` = plan +0, `doc[7]` = plan +1;
  `page.get_text("words")` → tokens matching `L\d+` give label centres (page pts). Confirmed
  L10≡L4 footprint, L12≡L9 footprint (dual-codes `L4/L11`→L4+L10, `L9/L12`→L9+L12).
- **Façades/coupes** (building-axis, orthographic): `navvis_export/facades_coupes_aligned/`
  (`belev_*`, `bcoupe_*`, previews + `facade_heights_aligned.csv`).

## Coverage caveat
Upper-floor scan coverage is thin where it matters: **Aile Sud-Est +1 ≈ 20 %, Aile Ouest +1 ≈ 11 %**.
Ground floors are well covered. So as-built geometry is reliable on +0, partial on +1.

## Suggested work for the next agent
1. **Align before comparing.** Rotate each building's orthophoto by its axis angle (above) — or use
   the already-aligned `facades_coupes_aligned` logic — so the scan and the squared-up architect plan
   line up. Only then are shape differences (elbows) unambiguous.
2. **Per-lot design-vs-existant table.** For each lot, overlay the design footprint (from the PDF
   plan, positions already extractable) onto the aligned orthophoto; trace the existing wall outline;
   report: design area, as-built footprint area, and a geometry-match flag (e.g. "elbow not followed").
   Start with the well-covered +0 lots (L1–L9).
3. **Flag, don't auto-correct.** These are design decisions (the architect may intentionally
   reconfigure the ruin). Produce a discrepancy report for the architect/géomètre, not silent edits.
   Surface labels (areas) are already corrected — do NOT touch them based on geometry.
4. **L1 first** (the trigger case): quantify the elbow — is the existing L-shaped wing larger than
   the drawn 76 m² straight room? Compare to the 6190 sum for that wing (G7+G9+G11+G12+G14 ≈ 100 m²
   gross for those rooms) and to the design 76 m².

## Hard constraints (from CLAUDE.md / project)
Legal/cadastral context — never invent values; flag and confirm with the géomètre/architect.
Preserve originals; any CAD edit goes on a duplicated layer. Output DXF (DWG needs ODA / the
géomètre's CAD — open-source DWG write fails on this AC1032 file).
