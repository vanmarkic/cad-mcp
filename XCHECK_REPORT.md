# Cross-check report — `260608_FermeduTemple_FINAL.dxf`

_2026-06-09. Independent verification of the delivered file against every source. Units = cm
(`$INSUNITS=5`). **No file was modified** by this cross-check — `FINAL.dxf` is left pristine; an
editable copy `260608_FermeduTemple_FINAL_xcheck.dxf` was made as a sandbox. Per CLAUDE.md
(legal/cadastral; never write values without sign-off), all proposed fixes below are **recommendations**.

## Methodologies applied (6, independent)
1. **Structural audit** — `ezdxf.audit()` + layer/entity census.
2. **Multi-source value cross-check** — every label vs architect PDF table, 6190 surveyor, NavVis.
3. **Geometry re-derivation** — shoelace area of every layer-0 HATCH, matched to its label.
4. **MTEXT byte-integrity** — raw formatting-code diff of corrected vs original labels.
5. **Visual placement** — label coordinates vs the architect PDF +1 plan (independent of the DXF).
6. **Isoperimetric quotient** Q=4πA/L² + shapely validity on lot polygons (degeneracy check).
Plus: binary diff `FINAL` vs `corrige`, and web review of area-QA methodology.

---

## BOTTOM LINE
The file is **structurally sound and its values are internally consistent with the agreed source**
(architect PDF). Audit = **0 errors / 0 fixes**. Originals are intact, the 6 documented value-fixes
are present and surgical, L13/L10 are placed correctly per the architect PDF, and the delivered set
reproduces the PDF programme total **Σ ≈ 1390.5 m² (PDF 1391)** exactly.

**However**, the file is **not yet "open-and-read clean"**: the original (old-value) label layer is
still switched ON, so it overlaps the corrected layer (6 lots show doubled, contradictory text). That
plus a few staleness/consistency items below should be cleaned before sending. **None of the findings
is a wrong area value** — they are visibility/consistency/documentation issues.

---

## PASS — verified correct
| # | Check | Result |
|---|---|---|
| P1 | DXF valid | AC1032, `audit()` 0 errors / 0 fixes |
| P2 | `FINAL` ≡ `corrige` | only FINGERPRINTGUID + save-timestamp differ; content identical |
| P3 | Originals preserved | `Tekst-ruimtelabel` holds all 40 original labels, every old value intact |
| P4 | 6 value-fixes present | L1+0 61.8→**76**, L5+1 51→**60**, L6+1 52→**58**, L9+0 89→**63**, L7+0 66→**93**, L8+0 67.5→**94** |
| P5 | Edits surgical | only the digits after `\P` changed; all MTEXT formatting codes byte-identical → no corruption |
| P6 | Geometry untouched | layer-0 hatches still measure the **old** values to <1 m² (61.4/65.7/67.9/88.8/51.3) |
| P7 | Values vs PDF | every delivered lot value traces to the architect PDF **except L11** — see C1 below (L11 shows the file's geometry-measured 106.5; PDF rounds to 107) |
| P8 | Totals | +0 Σ=615, +1 Σ=775.5 → **1390.5** vs PDF 1391 — the **0.5 gap is exactly L11 (106.5 vs 107)**, see C1 |
| P9 | L13 placement | matches PDF +1 plan: south wing, **west of L12** ✓ |
| P10 | L10 placement | matches PDF +1 plan: west wing below L3 (= +1 of the L4 footprint) ✓ |
| P11 | AVERIFIER visible | red layer (color 1), char_height 41.34, style Corbel → renders correctly |
| P12 | Polygon sanity | all 13 lot hatches healthy Q (0.38–0.74), no slivers |

---

## FINDINGS — ranked (all are consistency/usability, **not** wrong areas)

### F0 — HIGH · Original label layer left ON → doubled, conflicting text on open
Both `Tekst-ruimtelabel` (originals) **and** `Tekst-ruimtelabel-corrigé` are `on=True, frozen=False`.
At **6 points** the old and new differ, so a CAD app shows both overlapping:
`L1 61.8 & 76 · L5 51 & 60 · L6 52 & 58 · L7 66 & 93 · L8 67.5 & 94 · L9 89 & 63`.
The pre-existing render (`reference/plan_corrige_etage.png`) hides this because it draws only the
corrected layer. **Fix (safe, reversible, no value written):** freeze/turn OFF `Tekst-ruimtelabel`
in the delivered file (originals stay preserved in-file). The email already documents the layer
scheme, so professional recipients can also do this — but the file should read clean as shipped.

### F1 — HIGH · Stale superseded +1 labels for L7 & L8 remain on the corrigé layer
`corrigé` still carries the OLD upper-floor values **L7 +1 = 54** and **L8 +1 = 56**, while the
provisional new ones live on the red layer (**L7 +1 = 62**, **L8 +1 = 94**). With originals frozen
(F0), L7 then shows `93` (+0) and **both** `54` (black) and `62` (red) for +1 — a black "confirmed"
value contradicting the red "à confirmer" one. **Recommendation:** remove the stale `L7 54` / `L8 56`
from `corrigé` (the values are still on the frozen original layer), so the +1 of L7/L8 exists only as
the red provisional. Needs sign-off (deletes 2 label entities).

### F2 — MEDIUM (by design, must communicate) · Corrected labels disagree with the polygon beneath them
The 6 fixed labels now diverge from the geometry still drawn in the file:
`L1+0 76↔hatch 61.4 · L7+0 93↔65.7 · L8+0 94↔67.9 · L9+0 63↔88.8 · L5+1 60↔51.3 · L6+1 58↔~52`.
This is intentional — the PDF is a **newer design**; 260608's polygons are the **older** one and were
not re-drawn. But anyone QA-ing by measuring polygons will get the old numbers. **State this
explicitly to the géomètre/architect** (it is the crux of "which design is current"). Already in
`CROSSCHECK_lots.md`; re-confirmed here by direct re-measurement.

### F3 — MEDIUM · L10 = 79 written despite a FAILED envelope test
`STRATEGY_contested.md` found Aile Ouest +1: ΣPDF 361 > 6190-measured 315, scan only 11% → it
recommended **HOLDING L10/L11**. `FINAL.dxf` nonetheless writes **L10 = 79 (à confirmer)**. Placement
is correct and it's flagged, but **L10 is the weakest-supported provisional value** (failed the only
sanity check available). Highlight it to the géomètre above the others. (L11 stays at the
geometry-backed 106.5 — fine.)

### F4 — LOW · `CORRECTION_applied.md` is out of date vs the shipped file
It states the red layer holds **only L13**; the actual `FINAL.dxf` red layer holds **5** labels
(L7+1 62, L8+1 94, L10 79, L12 63, L13 78). The French email *does* match the file. Update
`CORRECTION_applied.md` so the paper trail matches the deliverable.

### F5 — LOW · Fully-overlapping identical duplicates after the duplex fixes
After fixing the +1s, `corrigé` has two identical `L5 60` at one point and two identical `L6 58` at
one point (duplex: +0 and +1 both equal). Harmless but they render exactly on top of each other.
This is inherent to the source's "two stacked values at one point" convention; consider offsetting
for legibility. (Same coincidence existed in the original.)

### F6 — LOW · L13 lacks the "(à confirmer)" marker its 4 red siblings carry
On the same red layer, L7/L8/L10/L12 read "… m² (à confirmer)"; **L13 reads only "78 m²"**. This may
be deliberate (L13=78 was triangulated 3 ways — PDF table + vector-plan reconstruction + direct label
read — so it is the best-supported new lot), but it's a mixed signal (red = provisional, yet no
marker). Decide: add the marker for parity, or keep it as the confidence cue. (The render shows it
*with* the marker — render and DXF disagree here.)

### C1 — NEW (raised by adversarial critic) · L11 visible value is 106.5 (geometry), not PDF 107
The only visible L11 label reads **106.5 m²** (`corrigé`, unchanged — it was already correct). The
architect PDF says **107**. These are reconcilable: 106.5 is the file's own **geometry-measured**
hatch area (`CROSSCHECK_lots.md` rated it the **highest-confidence, geometry-backed** lot — L11 is a
single physical room, not a design-split), and 107 is the PDF's rounded figure. So L11 is the **one
lot whose visible value derives from measured geometry rather than the PDF.** **Do not blindly
overwrite 106.5 with 107** (that replaces a measurement with a rounding). **Cover-note action:** ask
the architect/géomètre which to display (106.5 measured vs 107 rounded). This also fully explains the
0.5 m² gap in the Σ=1390.5 vs 1391 total (P8).

### F7 — MEDIUM (raised by adversarial critic) · Dual-codes show visible contradictions; one is stale
The three dual-codes remain visible on `corrigé` and now sit beside the corrected values:
- **`L9/L12 88`** — value **88 matches NO current PDF cell** (L9=63, L12=63). It is a **stale**
  superseded value (≈ the old L9+0≈89/geometry 88.8), sitting next to the corrected `L9 63` and the
  red `L12 63` → a visible contradiction. By the same logic as F1 it is removable, **but** it is in
  the documented "held-for-architect dual-code" bucket, so I did **not** auto-delete it. Recommend:
  architect confirms, then drop it.
- **`L4/L11 79`** — value 79 = **L10**'s area (not L4=77, not L11=107); PDF puts **L10** above L4 →
  tag should reference L10; the red `L10 79` already carries it. Mis-tag, correct value.
- **`L2/L10 53`** — value 53 **is** L2's +1 (correct); after F0 hid the originals, this is now the
  **sole visible carrier of L2 +1**. Keep the value; fix the tag.
All three need the architect to confirm the +1 re-numbering before splitting/relabelling.

### F8 — LOW (deferred) · "atelier construction" conflict
Two labels (91, 71); geometry backs 71 (71.2) and ~87.3 for the "91"; PDF programme says 145.
Unresolved space-label item (Part B), intentionally out of scope of the lot correction.

### Notes (informational, no action)
- One layer-0 hatch (the `L4/L11=79`, area 78.75) is a **non-simple ring** in the *original*
  geometry (shapely invalid) — pre-existing, not introduced by the correction.
- Terraces (L5 +44, L6 +42) are **not labeled** in the DXF — consistent with the PDF convention of
  excluding them from the lot totals; flag only if cadastral intent requires them shown.
- Layer name uses an accent (`…-corrigé`); fine but some legacy CAD importers dislike non-ASCII.

---

## Remediation status
**APPLIED to `260608_FermeduTemple_FINAL_xcheck.dxf`** (FINAL.dxf left byte-for-byte pristine):
- ✅ **F0** — froze + turned OFF `Tekst-ruimtelabel` (originals preserved in-file, hidden).
- ✅ **F1** — removed stale `L7 54` / `L8 56` from `corrigé` (40→38).
- ✅ **F4** — `CORRECTION_applied.md` rewritten to match the deliverable.
- ✅ **F6** — added "(à confirmer)" to L13 for parity.
- Audit after edits **0/0**; verified by a 6-agent adversarial workflow (see appendix).

**NOT applied — need architect/géomètre sign-off (never invent a value):**
- **C1 (L11)** — display 106.5 (measured) vs 107 (PDF rounded)? Confirm, don't auto-overwrite.
- **F7** — resolve the 3 dual-codes (`L9/L12 88` stale; `L4/L11 79` & `L2/L10 53` mis-tagged).
- **F2** — label-vs-geometry divergence (design evolution); **F3** — L10 is the weakest provisional.
- **F5** — optional cosmetic offset of the coincident L5/L6 duplex labels.

## Appendix — adversarial verification (6-agent workflow, ~1M tokens)
Each agent independently re-derived from the files (own scripts, not trusting prior work) and tried to
**falsify** its claim:
| Dimension | Verdict | Conf |
|---|---|---|
| edit-integrity (only the 3 edits changed; FINAL pristine) | PASS | 0.98 |
| originals-preserved (40 labels byte-identical, off+frozen) | PASS | 0.99 |
| values-vs-PDF (no fabricated value; +0=615, +1=775.5) | PASS | 0.95 |
| geometry-untouched (13 hatches byte-identical between files) | PASS* | 0.99 |
| placement-vs-PDF (L13 W of L12; L10 west wing; L7/L8 SE spur) | PASS | 0.93 |
| completeness critic | CONCERN | — |
\*the "concern" label = the *expected* by-design label≠geometry divergence (F2); the geometry itself
is unchanged. The critic forced two corrections to this report: **P7** (L11=106.5 is geometry, not
PDF 107 → C1) and **P8** (the 0.5 m² total gap is exactly L11), and elevated **F7** (visible
dual-code contradictions). All three are reflected above.
