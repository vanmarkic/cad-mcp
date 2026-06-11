# 260608 — Corrections APPLIED (record)

_2026-06-09. Records exactly what was written to the corrected DXF files. Route with
`CORRECTION_PROPOSAL.md`, `CROSSCHECK_lots.md`, `XCHECK_REPORT.md` + the DWG to the géomètre/architects._
_Updated after the cross-check (`XCHECK_REPORT.md`): this file previously listed only L13 on the red
layer — corrected below to the actual 5 labels, and the cleaned `_xcheck` candidate is now documented._

## Files
- `260608_FermeduTemple.dwg/.dxf` — **originals, untouched** (the surveyor/architect source).
- `260608_FermeduTemple_FINAL.dxf` — **as-sent deliverable** (pristine; = `…_corrige.dxf` in content).
- `260608_FermeduTemple_FINAL_xcheck.dxf` — **cleaned candidate** produced by the cross-check
  (FINAL + fixes F0/F1/F6 below). `FINAL.dxf` itself is left byte-for-byte pristine.

## Layers (in both FINAL and _xcheck)
- `Tekst-ruimtelabel` — **original 40 labels, old values, untouched.** In FINAL: layer ON (overlaps
  the corrected layer ⚠️). In **_xcheck: layer OFF + frozen** (preserved in-file, just hidden) — fix F0.
- `Tekst-ruimtelabel-corrigé` — copy of the 40 labels with the 6 value-fixes. In FINAL: 40 labels.
  In **_xcheck: 38 labels** (2 stale superseded +1 labels removed — fix F1).
- `Correction-L13-AVERIFIER` — red (color 1) provisional layer, **5 labels** (à confirmer).

## Applied — data-certain value fixes (6, on `Tekst-ruimtelabel-corrigé`)
| Lot | floor | before | after | source |
|---|---|---|---|---|
| L1 | +0 | 61.8 | **76** | PDF (current was −19%) |
| L5 | +1 | 51 | **60** | PDF (duplex = +0) |
| L6 | +1 | 52 | **58** | PDF (duplex = +0) |
| L9 | +0 | 89 | **63** | PDF (current was +41%) |
| L7 | +0 | 66 | **93** | PDF |
| L8 | +0 | 67.5 | **94** | PDF (current was −40%) |

Left unchanged because already correct (de-dup only): L2 (45/53), L3 (49/51), L4 +0 (77),
L11 (106.5≈107), L1 +1 (71).

## Provisional — red layer `Correction-L13-AVERIFIER` (5 labels, **all à confirmer**)
| Lot | floor | value | basis | note |
|---|---|---|---|---|
| L7 | +1 | **62** | PDF; Aile Sud-Est +1 envelope-fit ✓ | F19 envelope, ~20% scan |
| L8 | +1 | **94** | PDF; SE+1 envelope-fit ✓ | F19 envelope |
| L10 | +1 | **79** | PDF | ⚠️ **weakest** — Aile Ouest +1 envelope test FAILED (PDF 361 > measured 315, 11% scan) |
| L12 | +1 | **63** | PDF; SE+1 envelope-fit ✓ | F19 envelope |
| L13 | +1 | **78** | PDF table + vector-plan reconstruction + direct label read (3 ways) | best-supported new lot; placed west of L12 (matches PDF +1 plan) |

Value/position are provisional pending architect/géomètre sign-off (these +1 splits sit in the
F19/F18 whole-floor envelopes on thinly-scanned floors).

## Cross-check cleanup applied to `_xcheck.dxf` only (FINAL.dxf untouched)
- **F0** — froze + turned OFF `Tekst-ruimtelabel` so the file reads clean (no old/new overlap on open).
- **F1** — removed the 2 **stale superseded** +1 labels from `corrigé`: `L7 54` and `L8 56` (their
  replacements 62/94 live on the red layer; the old values remain on the hidden original layer).
- **F6** — added "(à confirmer)" to the L13 red label for parity with its 4 siblings.
- Audit after edits: **0 errors / 0 fixes**. Geometry and all non-label layers byte-identical to FINAL.

## HELD for géomètre/architect (NOT written / left at current value)
- **Split the dual-coded labels** `L2/L10`, `L4/L11`, `L9/L12` once the architect confirms the +1
  re-numbering. (Note: `L4/L11 = 79` value 79 = **L10**'s area, and the PDF puts L10 above L4 → the
  tag likely should reference L10; the red `L10 79` already supersedes it. `L2/L10 = 53` value 53 is
  L2's correct +1. **`L9/L12 = 88` is a STALE value** — no current PDF cell is 88 (L9=63, L12=63);
  it sits beside the corrected `L9 63` as a visible contradiction → drop on confirmation.)
- **L11 = 106.5 vs PDF 107** — the visible label keeps **106.5** (the file's geometry-measured value,
  rated highest-confidence in `CROSSCHECK_lots.md`); the PDF rounds to 107. Confirm which to display;
  do **not** auto-overwrite the measurement. (This is the sole 0.5 m² gap in the Σ vs PDF 1391.)
- **Terrace convention** (L5 +44, L6 +42 excluded from totals) — confirm cadastral intent.
- **Space labels** (salle commune, foyer, ateliers incl. the 91-vs-145 "atelier construction"
  conflict, bare numbers) — per `CORRECTION_PROPOSAL.md` Part B; need per-label source decision.
- **Label-vs-geometry divergence** (by design): the 6 fixed +0 labels now differ from the polygons
  still drawn beneath them (geometry = older design). State to the géomètre — see `XCHECK_REPORT.md` F2.

## DWG export
Open-source DWG write-back is not viable for this AC1032 file (LibreDWG `dwgwrite`/`dxf2dwg`
error 0x800). **To produce the .dwg**: open the DXF in AutoCAD/BricsCAD/etc. and *Save As* DWG
(DXF is fully interchangeable), or install ODA File Converter from opendesign.com.
