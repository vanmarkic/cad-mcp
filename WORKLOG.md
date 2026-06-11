# WORKLOG — Ferme du Temple lot/area correction

_Last updated: 2026-06-09. Working notes / decision record for this session. See CLAUDE.md for
the durable tooling guide; this file is the narrative of what we did and why._

## Objective

Two asks:
1. **Investigate** how to pilot an open-source CAD editor via MCP.
2. **Correct the wrong measurements** in `260608_FermeduTemple.dwg` (lot areas L1–L13 + space
   areas), using the other sources as references, and **add the missing L13**. Edits go on a
   **duplicated** layer (originals preserved); output as **DXF + best-effort DWG**.

## Source files & roles (authority hierarchy)

Per `navvis_export/REFERENCE_SOURCES.md` (Jordy/Carton123, 2026-06-08): architect plans are
*approximate*; the two surveyors' relevés (6190 vs NavVis) "présentent déjà de nombreuses
différences"; the building is heritage-listed so the **as-built scan is what matters**.

| File | Role | Authority |
|---|---|---|
| `260608_FermeduTemple.dwg` | **Target** to fix (AutoCAD 2018, units = cm) | — (being corrected) |
| `navvis_export/` | **NavVis 3D as-built scan** (ImmoPass / N. Biquet) | **Highest** (precise as-built); room-level areas still being added |
| `6190 plan de division (2).dwg` | Surveyor measured plan / parcels (Immo-Geo, J. Albert) | Interim per-room areas; known to differ from NavVis |
| `260512_presentation_light.pdf` | Architect presentation (final **layout**, incl. L13) | Approximate areas; authoritative for **lot locations** |
| `Aanzicht - tegels grijs 10x10.pat` | Incidental hatch pattern | — |

## Part 1 — MCP investigation (done)

Conclusion: every DWG-capable "CAD MCP" server (CAD-MCP, multiCAD-mcp, puran-water/autocad-mcp)
drives a **proprietary Windows** app (AutoCAD/ZWCAD/GstarCAD/BricsCAD) via COM/AutoLISP →
Windows-only, unusable here. The only open-source macOS MCP-pilotable editor is
**FreeCAD + freecad-mcp**, but it's 3D-first with lossy DWG import and poor precision for 2D
label edits. **Decision: do the edit headless with LibreDWG + ezdxf** (chosen with user).

## Toolchain established (verified working)

- **LibreDWG** (`brew install libredwg`): `dwg2dxf` for both DWGs. 6190's DXF had a long-MTEXT
  bug (raw newlines split DXF line-pairs) → sanitized by merging non-integer "code" lines into
  the prior value; `dwgread -O JSON` also works (output is **latin-1**, not UTF-8).
- **ezdxf** in `./.venv` (macOS PEP 668 blocks global pip). Also installed: shapely, numpy,
  matplotlib, pypdf.
- **poppler** (`pdftotext`, `pdftoppm`, `pdfinfo`) for the PDF. Plan-page labels use a
  `PDFTron-Identity` font that won't extract as text → render to PNG and read visually.
- DWG write-back (AC1032) needs ODA File Converter (not yet installed); ezdxf writes DXF only.

## What we found

### 260608 (target)
- 16 layers; lot/space labels are MTEXT on layer **`Tekst-ruimtelabel`**. No DIMENSION entities.
- Each lot carries **two stacked area values at one point** = the +0 and +1 floor areas overlaid.
  Several are wrong vs the architect/final: **L1 61.8→76, L7 66→93, L8 67.5→94, L9 89→63**, etc.
- **L13 is absent.** It belongs on +1, bottom-left of the right wing beside L12 (per PDF).

### Architect PDF surface table (p.9) — totals (m²)
`L1 147 · L2 98 · L3 100 · L4 77 · L5 120 · L6 116 · L7 155 · L8 188 · L9 63 · L10 79 · L11 107
· L12 63 · L13 78` (Σ 1391). Per-floor splits reconcile (e.g. L1 = 76+71). Approximate, not final.

### 6190 (surveyor)
- Measured **rooms** (not lots): tags `Nd:<level> | Aire:<m²> | Hsp:<height> | P:<perim>` on
  layer `Légende`. **No lot grouping, no lot table** anywhere (checked TABLE entity + paperspace).
- 45 rooms in this building: **25 ground** (cluster A, x<118500, Nd≈96–97) cataloged G1–G25,
  **20 first floor** (cluster B, x≈120200, Nd≈100–101) cataloged F1–F20 — the first-floor plan is
  drawn **offset ~+3206 m in X** on the survey sheet.
- Cleaned copy saved → `6190_clean.dxf` (audit 0 errors; removed 3 unused layers + 3 linetypes).

### NavVis export
- 5 georeferenced buildings + footprint areas: **Aile Ouest 564, Aile Sud-Est 450, Atelier 455,
  Chapelle 240, Maison principale 182** m². Floors carry z-ranges + volumes; **room-level areas
  not present yet** (still being added).
- Georef: EPSG:8370 (Belgian Lambert 2008), SITE origin **E 617027.344 / N 621045.953**, no
  rotation (rx=1, ry=0).

### Coordinate key (the unlock)
All sources reconcile in one frame:
- **6190 = NavVis-local + (117027.344, 121045.953)** exactly (= Lambert 2008 − 500 000).
- **260608** = cm; ÷100 is near the same frame but offset ~100 m → it's a local CAD frame needing
  a similarity fit (its own coordinates are used directly for the final label placement anyway).
- **PDF** = page space (used for the lot layout, read from rendered plans p7=+0, p8=+1).

## Decisions taken (user)

1. Output format: **DXF + DWG**.
2. Edit method: **headless ezdxf** (no GUI/MCP).
3. 6190 cleanup: **purge + audit, save clean copy** (done).
4. Area source: **derive from 6190** → then refined to **"I define room groupings"** (user will
   map lots→6190 room IDs; we sum precise areas).
5. Scope: **lots + space areas** from 6190.
6. Label strategy: corrections on a **duplicated** `Tekst-ruimtelabel` layer; originals untouched.
7. L13: **add at the PDF spot** (+1, beside L12).
8. Alignment/derivation method: **research best methods** → used 2D Helmert/similarity transform
   + point-in-polygon + cross-source validation (NavVis georeferencing made it exact).

## Current state

- Background **workflow `wpoywlyld`** (navvis-6190-integration) running: refine 6190↔NavVis
  alignment → assign rooms to buildings + reconcile areas → adversarially verify → synthesize a
  **building-constrained draft lot grouping** (`reference/DRAFT_grouping.md`).
- Preliminary room→building decomposition computed (see `reference/UNIFIED_overlay.png`).

## Artifacts produced

- `6190_clean.dxf` — purged/audited 6190.
- `reference/` — 6190 room maps (G/F ids+areas), PDF plan crops (+0/+1), `UNIFIED_overlay.png`.
- `/tmp/cadwork/` — conversions (DXF/JSON), scripts, `facts.json` (PDF table, architect ateliers,
  260608 labels), `integrated.json` (rooms→buildings + transform).
- `CLAUDE.md` — durable tooling/architecture guide.

## Open items / next steps

1. **NavVis room-level areas** are the eventual authoritative source — re-check `navvis_export/`
   as it grows; plug in when present.
2. User to confirm/correct the **draft lot→6190-room grouping** (or provide final figures).
3. Quantify the **6190-vs-NavVis differences** (workflow) so we know how much to trust 6190 interim.
4. Then: write corrected labels onto the duplicated layer in 260608, add L13, export DXF + DWG.
5. Handle 260608's **duplicate/stacked labels** carefully during the edit (which entity to update).

## Update 2026-06-09 — workflow results + NavVis grew

### Workflow `wpoywlyld` (6 agents) — verified integration
- **Alignment**: 6190 → NavVis is a near-pure **rigid translation** (+5 m X ground; first-floor
  sheet offset xoffB = 3205.5 m), **100% ground / 95% first** rooms inside footprints, mean
  residual **0.24 m**. Regularized to avoid overfitting abstract label points. One genuine
  outlier: **F1** (161 m², Maison principale upper) sits ~10.85 m outside the footprint → a real
  6190-vs-NavVis discrepancy, flagged not chased.
- **Area reconciliation**: NavVis footprints Σ 1891 m² (single-floor gross) · 6190 net rooms Σ
  2409 m² (1342 +0 / 1066 +1) · PDF lots Σ 1391. Architect PDF runs ~15% above 6190 net per wing
  (architect optimistic vs as-built) — the documented 6190-vs-NavVis divergence, quantified.
- **Structural blocker (key)**: 6190 has **un-partitioned whole-floor envelopes** the architect
  subdivides — **F19 (348 m² = entire Aile Sud-Est upper floor → L7/L8/L12/L13 +1)**,
  **F18 (158 → L10/L11)**, **G25 (129 → L5/L6 ground)**. Per-lot UPPER areas are therefore **not
  derivable from 6190 alone**.
- Adversarial verifiers flagged boundary-fragile rooms (G15 near Chapelle; F13 Maison/Ouest tie;
  F15 near party wall). Draft → `reference/DRAFT_grouping.md` (mostly low-confidence for the reason above).

### NavVis export grew (areas/ + footprint DXFs + rooms probe)
- `areas/AREAS_consolidated.md` — user's pipeline **independently reproduced the same
  6190→building assignment** (cross-validation ✓), plus PDF/ateliers/260608 tables.
- `raw/rooms_probe.json` — confirms NavVis **still has no room-level areas** (floors' children=[]);
  only building footprints + POI type definitions.
- `ferme_du_temple_footprints_local_{m,cm}.dxf` — NavVis building outlines as DXF (cm for 260608 overlay).
- `STATUS.md` — open decision on their side: build per-storey **floor-plan rasters** vs full
  **point cloud** (either is needed to split the F19/F18/G25 envelopes into per-lot rooms).

### Converged conclusion
Ground-only & single-room lots are derivable now; per-lot **upper-floor** areas are blocked until
either (a) NavVis floor-plan/point-cloud data lets us split F19/F18/G25, or (b) the architect/user
supplies the lot composition or final figures. **Decision: wait for NavVis as-built** (per user).

### Output pipeline (de-risked 2026-06-09)
- **Edit engine PROVEN** (POC on throwaway copy, original untouched): duplicate `Tekst-ruimtelabel`
  → `Tekst-ruimtelabel-corrigé`; edit the area number *inside* the MTEXT formatting codes
  (`{\H..;\P<area> }`); DXF round-trip verified (original keeps old value, new layer has corrected).
- **DXF output: reliable** (ezdxf). **DWG (AC1032) write-back: open-source NOT viable** — LibreDWG
  `dwgwrite`/`dxf2dwg` fail with error 0x800 even round-tripping their own DXF. → DWG requires
  **ODA File Converter** (free, separate install) or re-save from the user's CAD app.

### Monitoring
- Background watcher polls `navvis_export/` every 120 s and re-notifies when it grows (waiting for
  per-storey floor plans / point cloud / room-level areas).

## Update 2026-06-09 (later) — orthophotos + QA report landed

### NavVis area QA report (`areas/QA_REPORT.md`) — validates our analysis
- Trust the **per-room 6190 areas** (45 rooms, Σ 2408.84, all pass isoperimetric test). Do **not**
  trust consolidated per-building +1 sums or any current DWG label.
- **F1 "Grenier" (161 m²) mis-assigned** (10.6 m outside Maison principale) → exclude/reassign;
  it makes MP+1 exceed its own footprint. Defensible MP+1 = 127.5 (excl. F1).
- 260608 holds **conflicting label pairs** for L1–L9 (+L11) and **L13 absent**; worst errors
  **L8 (−40%) and L9 (+41%)**. Dual-coded `L2/L10`, `L4/L11`, `L9/L12` must be split.
- The three totals (NavVis 1891 footprint / PDF 1391 programme / 6190 2409 interior) **measure
  different things** — never equate.
- `HEIGHTS.md`: confirms double-height volumes (G25 Hsp 10.55, G8 11.70); true ridge/façade
  heights need the point-cloud phase.

### Orthophotos (`orthophotos/plan_<building>_<floor>.tiff`) — georeferenced, layout-grade
- 10 GeoTIFFs (per building × floor +0/+1) + `preview/*.png`. **GeoTIFF tags give exact georef**
  in NavVis-local m (ModelPixelScale ≈ 1–2 cm/px, ModelTiepoint = top-left). Overlaid cleanly with
  footprints + 6190 rooms → `reference/ortho_{SudEst_1,Ouest_1,Ouest_0}.png`.
- **Assessment**: rasters confirm the as-built **layout** but are **too noisy to trace per-lot
  partition walls at cadastral precision** (point-cloud top-down; interior walls ambiguous). Per
  `STATUS.md`, measurable floor plans / precise room areas need the **point-cloud phase** (pending).

### Where that leaves the upper-floor split
F19/F18/G25 still can't be split to precise per-lot areas from rasters alone. Options: (a) wait for
the NavVis **point-cloud** phase, or (b) apply the QA-validated corrections now using the architect
PDF as agreed interim source (uppers flagged provisional). **Pending user decision.**

## Update 2026-06-09 (later 2) — 260608 geometry + PDF reconstruction

### 260608 carries the lot areas as GEOMETRY (not just labels)
Swept every layer. The lot net areas are drawn as **HATCHes (layer `0`, ×13) + SOLIDs (×9)** and as
**`_Nieuw-4 massa`** walls (polygonisable). Their areas match the *old* labels to <1 m² (L11 hatch
106.5 = PDF 107 → confirmed; L1/L2/L3/L4/L5/L6/L7/L8/L9 all geom-backed per floor). The space labels
are backed by **`Oppervlakte-netto`** HATCHes (salle commune 126.6, studio 56.9, …). ⇒ the L7/L8/L9
label/PDF gaps are **design evolution**, not errors. **L10/L12/L13 have NO geometry in 260608.**
Cross-check matrix → `CROSSCHECK_lots.md`.

### L13 reconstructed from the PDF +1 plan ✅
Page 8 is **vector**. Polygonised the wall lines → room faces; calibrated scale against known lots
(L1+1=71, L5/L6 60/58, L10≈79) ⇒ **~0.0200 m²/pt²**. The elbow face = 3896 pt² → **≈78 m²**, and a
high-res crop reads the label **"L13 — 78 m²"** directly. ⇒ **L13 = 78 m² confirmed** (architect
*design*; geometry-backed, not just the rounded table). Same method can reconstruct L10/L12 and
confirm L7+1/L8+1. (Note: 78 is a *design* figure — the partition is not built in the scan.)

### French email drafted (subagent)
`EMAIL_geometres_architectes_FR.md` — ready-to-send summary for Immo-Géo (J. Albert) + Carton123
(Jordy): démarche, constats, corrections appliquées, demandes (DWG de conception actuel, relevé des
niveaux supérieurs, double-codes, terrasses).

## Update 2026-06-09 (later) — room-area readable files + QA, heights, overlays

User asked (in order): **(1) room-level areas → readable files, (2) floor plans + heights, (3) full
point-cloud as-built**. Delivered #1 + heights:
- `navvis_export/areas/` now has: `AREAS_consolidated.md` (master), `areas_6190_rooms.csv/.json`
  (45 rooms: Aire/Hsp/perim/Nd + building + floor), `areas_navvis.csv`, `areas_pdf_lots.csv`,
  `labels_260608_current.csv`, `HEIGHTS.md` + `heights_navvis_storeys.csv`, **`QA_REPORT.md`**.
- `navvis_export/README.md` (index), `overlay_{ground,first}_*.png` (footprints + rooms map per floor).
- **5-agent adversarial QA** (`QA_REPORT.md`): extraction sound (45 rooms, Σ2408.84, all isoperimetric
  valid, CSV≡JSON≡raw). Baked caveats into `AREAS_consolidated.md`: F1 «Grenier» mis-assigned (MP+1 =
  127.5 inside vs 288.9 ⚠️); 3 totals not comparable; PDF drops 86 m² terraces; 260608 dup/missing labels.
- **Heights** (#2 partial): NavVis storey z-levels + 6190 Hsp per room. True façade/ridge heights ⇒ #3.

### Remaining (blocked on as-built interior partitions)
- #2 floor plans / #3 point cloud are needed to **split F19/F18/G25 whole-floor envelopes** into per-lot
  rooms (the upper-floor blocker). NavVis raster gridmaps = top-down only & `.nvr` quadtree not yet
  decoded; point-cloud octree path not yet located (loads lazily in a 3D mode). Next: drive the viewer
  into point-cloud mode to capture octree URLs + gauge size, then slice → plans/coupe/façade.
