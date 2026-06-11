# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this workspace is

A working area for **correcting lot/space surface labels in an architectural DWG** for the
**Ferme du Temple** (Frameries, BE) — a **renovation of a heritage-listed, currently roofless/
overgrown farm ruin**. The labels (lots L1–L13 + common spaces) in the architect DWG `260608` are
reconciled against three other sources: the surveyor's plan (`6190`), the **NavVis 3D as-built scan**
(`navvis_export/`), and the architect's presentation PDF (`260512`).

**Not a software project** — there is no app to build. The "code" is throwaway Python (ezdxf +
shapely) that reads/edits the CAD/PDF files. Treat the CAD/PDF/scan files as the real artifacts.

⚠️ **Legal/cadastral. Never invent or guess area values.** Corrections go on duplicated layers,
originals untouched, and contested values are flagged "à confirmer" for the géomètre/architect.

## Status (2026-06-09)

Surface-label corrections are **applied and packaged**; the project is **awaiting géomètre/architect
sign-off (round 2)**. A *separate* design-vs-as-built **geometry** reconciliation is documented but
**not executed** (see `FINDINGS_design_vs_asbuilt.md`). See `WORKLOG.md` for the full narrative.

## Source files & authority

| File / dir | Role | Notes |
|---|---|---|
| `260608_FermeduTemple.dwg` | **TARGET** (architect, *design*) | AutoCAD 2018 (AC1032), units = **cm**. Lot labels on layer `Tekst-ruimtelabel` (MTEXT); lot areas also drawn as HATCH/SOLID on layer `0` + `_Nieuw-4 massa` walls. |
| `navvis_export/` | **NavVis 3D as-built scan** (ImmoPass) | Highest-precision *existing* state. Building footprints, georeferenced **orthophotos** (floor plans), **façades/coupes**, per-room areas in `areas/`. |
| `6190 plan de division (2).dwg` | Surveyor measured rooms (Immo-Géo) | 45 `Aire:` rooms; **no per-lot table, no copropriété division**. Useful as envelope cross-check. |
| `260512_presentation_light.pdf` | Architect layout (*design*, approx) | **page idx 6 = plan +0, idx 7 = plan +1, idx 8 = surface table**. Vector; lot label positions extractable. |

**Authority hierarchy** (`navvis_export/REFERENCE_SOURCES.md`): NavVis as-built > 6190 > architect
PDF/DWG. **But it's a renovation**: `260608`/PDF = **PROJET** (design); NavVis/6190 = **EXISTANT**
(ruin). They differ *by nature* (e.g. L1's existing wing has an elbow the design straightens).

## Unifying coordinate frame (the key that makes cross-checks work)

- Common frame = **Belgian Lambert 2008**. `6190 = NavVis-local + (117027.344, 121045.953)`.
- `260608` is **cm** in a *separate* CAD frame (≈100 m offset; needs a similarity fit, not exact).
- PDF = page points; lot label centres via `fitz; doc[6|7].get_text("words")` (tokens `L\d+`).
- Orthophotos = **georeferenced GeoTIFFs in NavVis-local m**; transforms in
  `navvis_export/orthophotos/georef.json`. Pixel→world: `wx=xmin+col*mpp ; wy=ymax−row*mpp`.
- Building rotations from site axes (for aligning scan vs squared-up plan): Aile Ouest 15.9°,
  Aile Sud-Est 15.6°, Maison principale 14.5°, Atelier 5.1°, Chapelle 4.5°.

## Toolchain (verified working)

- **Read DWG:** LibreDWG (`brew install libredwg`): `dwg2dxf`, `dwgread -O JSON` (⚠️ JSON is
  **latin-1**, not UTF-8). 6190's DXF has a long-MTEXT bug (raw newlines split line-pairs →
  ezdxf `DXFStructureError`); sanitize by merging non-integer "code" lines into the prior value.
- **Edit/read DXF:** `ezdxf` in `./.venv` (macOS PEP 668 → always use the venv). Installed:
  `ezdxf, shapely, numpy, matplotlib, tifffile, imagecodecs, pymupdf(fitz), pypdf`.
- **Read PDF:** poppler (`pdftotext -layout`, `pdftoppm`, `pdfinfo`) **and** `fitz` (pymupdf).
  Plan-page labels use a `PDFTron-Identity` font → `pdftotext` fails, but **`fitz.get_text("words")`
  works** and the vector geometry (`get_drawings()`) is extractable.
- **Read GeoTIFF orthophotos:** `tifffile.TiffFile(p).pages[0].asarray()` — plain `tifffile.imread`
  chokes on the GeoTIFF tags (`GeographicType 'N'`).
- **Write DWG:** ezdxf writes **DXF only**. Open-source DWG write-back **fails** on this AC1032 file
  (`dwgwrite`/`dxf2dwg` → error 0x800). Deliver **DXF**; regenerate `.dwg` via ODA File Converter
  (no longer a brew cask — download from opendesign.com) or "Save As" in AutoCAD/BricsCAD.
- **Scripts:** write to **`/tmp/poc`**, NOT `/tmp/cadwork` (a stray `struct.py` there shadows
  stdlib). Never name a script `struct.py`/`inspect.py`/`types.py` etc.

## Piloting an open-source CAD editor via MCP — conclusion

Every DWG-capable "CAD MCP" (CAD-MCP, multiCAD-mcp, puran-water/autocad-mcp) drives a **proprietary
Windows** app via COM/AutoLISP — unsuitable (macOS, OSS). FreeCAD+freecad-mcp is the only OSS macOS
option but is 3D-first with lossy 2D DWG handling. **Decision: headless LibreDWG + ezdxf**, not GUI.

## Corrected DXF — layer structure

- `Tekst-ruimtelabel` — **original 40 labels, untouched** (old values).
- `Tekst-ruimtelabel-corrigé` — copy with 6 data-certain +0/+1 fixes (L1+0→76, L9+0→63, L7+0→93,
  L8+0→94, L5+1→60, L6+1→58).
- `Correction-L13-AVERIFIER` — red, **5 provisional** "à confirmer" labels (L7+1=62, L8+1=94,
  L10=79 *(weakest)*, L12=63, L13=78), reconstructed from the PDF +1 plan.
- Outputs: `…_FINAL.dxf` (pristine), `…_FINAL_xcheck.dxf` (cleaned: original layer frozen/off, stale
  +1 labels removed — **the one to send**), `…_corrige.dxf`.

## Document map

- `WORKLOG.md` — full narrative + decisions. `CORRECTION_applied.md` — exactly what's in the DXF.
- `CORRECTION_PROPOSAL.md` — per-label before/after (source-cited). `CROSSCHECK_lots.md` — multi-source
  lot cross-check. `XCHECK_REPORT.md` — verification + cleanup (F0/F1/F6). `STRATEGY_contested.md` —
  strategy for the contested upper lots. `FINDINGS_design_vs_asbuilt.md` — handoff for the geometry
  pass (L1 elbow, design vs existing). `EMAIL_geometres_architectes_FR.md` — client email (FR, humble).
- `reference/` — `plan_corrige_RDC.pdf`/`plan_corrige_etage.pdf` (corrected plans on architect base),
  `facades_coupes_aligned.pdf`, comparison/overlay PNGs.
- `navvis_export/` — the as-built extraction: `areas/` (6190 rooms, QA_REPORT, consolidated),
  `orthophotos/` (+ `georef.json`, `underlay/`, `plans_measure/`), `facades_coupes_aligned/`,
  `ACCESS.md`/`STATUS.md`/`REFERENCE_SOURCES.md`/`HANDOFF_to_correction_agent.md`.

## Held for géomètre/architect (round 2)

- Provisional +1 lots (esp. **L10** — Aile Ouest +1 envelope test failed, ~11% scan).
- Split the dual-coded labels `L2/L10`, `L4/L11`, `L9/L12`.
- Terrace convention (L5 +44, L6 +42 excluded from totals).
- Space labels (Part B: salle commune, ateliers incl. the 91-vs-145 conflict, bare numbers).
- Design-vs-as-built geometry (the L1 elbow et al.) — `FINDINGS_design_vs_asbuilt.md`.
- The actual `.dwg` (ODA / their CAD).

## Editing conventions (standing)

Preserve originals; modified entities on a **duplicated** layer; contested values flagged
"à confirmer" on a distinct layer. Clean 6190 (purge+audit) before using it. Work headless &
reviewable (label diffs). Never propagate an unconfirmed value into the legal doc.
