# Ferme du Temple — QA Report: Consolidated Room-Area Files

## 1. Verdict

The readable room-area files are **conditionally trustworthy as an interim reference, but NOT yet safe to hand off as authoritative cadastral input without three named corrections.** The core extraction is sound: all four lenses independently confirm the 45-room 6190 surveyor set is complete, internally consistent (CSV ≡ JSON ≡ raw `rooms_full.json`, row-for-row, Σ = 2408.84 m²), correctly unit-typed (genuine m², not cm²/ft² — verified against perimeters and the EPSG:8370 `+units=m` georef), and geometrically valid (all 45 pass the isoperimetric test). However, the *consolidated* picture carries one defect that propagates into a published per-building total (room **F1**, 161.36 m², is mis-assigned and inflates Maison principale +1 to a physically impossible 288.9 m² > 182.28 m² footprint), and the *target* DWG (`labels_260608_current`) is the legal artifact still full of errors: duplicate conflicting labels for every lot L1–L9, a missing L13, and individual label errors up to ±40%. The three headline totals (1891 / 1391 / 2409 m²) measure **different things** (footprint envelope vs. indoor programme vs. interior rooms) and must never be compared as one quantity. Bottom line: trust the per-room 6190 areas; do **not** trust the consolidated per-building +1 sums or any current DWG label until F1, the PDF terrace convention, and source authority are confirmed with the user.

## 2. Confirmed Issues by Severity

### HIGH

- **F1 "Grenier" is mis-assigned and inflates a published per-building total.** F1 (161.36 m², +1, raw tag `Grenier`) is the only one of 45 rooms flagged `inside=False`, sitting **10.62 m outside** the Maison principale footprint; its building was assigned by nearest-footprint fallback, not containment. This folds into "Maison principale +1 = 288.9 m²", which **exceeds the entire 182.28 m² building footprint by 106.6 m²** — physically impossible for a single floor. Excluding F1 gives a plausible 127.5 m² (net/fp = 0.70, matching the other four buildings). The site total 2408.84 m² also carries this 161 m² of mis-located area. *(extraction, assignment, reconcile, units — all four)*

- **Target DWG holds duplicate, CONFLICTING labels for every lot L1–L9.** Each of L1–L9 appears in two labels with different areas at near-identical coordinates (old value never deleted when corrected one was added): L1 = 61.8 vs 71; L2 = 45 vs 53; L3 = 49 vs 51; L4 = 77 vs 79; L5 = 60 vs 51; L6 = 58 vs 52; L7 = 66 vs 54; L8 = 67.5 vs 56; L9 = 89 vs 88. L11 also doubled (79 vs 106.5). This is an internal integrity defect in the artifact to be fixed; none of the conflicting current values should be assumed validated. *(reconcile, units)*

- **L13 is entirely missing from the DWG labels.** No label containing `L13` exists in `labels_260608_current.csv`; the PDF defines L13 = 78 m² (+1, approximate). Confirms the CLAUDE.md premise. L13 cannot be cross-validated against the 6190 surveyor until its room(s) are identified — do not invent its area. *(reconcile, units)*

- **Largest single-label errors vs PDF: L8 (−40%) and L9 (+41%).** L8 is labelled 56 / 67.5 vs PDF +0 = 94 m² (−38 m² / −40%); L9 is labelled 89 / 88 vs PDF +0 = 63 m² (+26 m² / +41%). Highest-priority numeric corrections, pending authoritative-source confirmation. *(reconcile)*

- **The three headline totals are not comparable.** NavVis 1891 m² = sum of 5 building **footprints/emprises** (outer-wall envelope, single-storey); 6190 2409 m² = 45 **interior rooms** across +0 (1342.35) and +1 (1066.49); PDF 1391 m² = **indoor lot programme** only. Comparing them as one quantity is meaningless; keep footprint vs interior vs programme on separate rows. *(reconcile)*

### MEDIUM

- **PDF "grand total 1391" is internally inconsistent.** Summing every cell incl. terraces = 1477 m²; the stated total column = 1391 m². The 86 m² gap is the L5 (44) and L6 (42) terraces, which each lot's "total" silently drops (L5 total shown 120 vs parts 164; L6 116 vs 158). The "total" column thus has two definitions across rows. Do **not** treat 1391 as a hard control figure, and state the terrace-exclusion convention explicitly before writing any total. *(reconcile, units)*

- **Three (to six) 6190 rooms have area ≈ perimeter — verify source, don't "fix".** G3 (66.58/66.58), G6 (32.47/32.46), G9 (18.91/18.91) match to two decimals; the units lens additionally flags F3 (19.38/19.29), F9 (17.55/18.0), F6 (16.76/16.48). Values are copied verbatim from the surveyor source (`Aire:66.58 … P:66.58`) and all pass area ≤ (P/4)² — geometrically valid, likely long thin corridors/stairwells, **not** a unit or parsing bug. G3's IPQ = 0.189 implies a ~1:14 aspect ratio. Confirm the **perimeters** against the surveyor source before treating P as authoritative; the areas remain usable. *(extraction, units)*

- **6190 room→building assignment is suspect wherever a +1 floor sum exceeds its footprint.** Beyond F1: Aile Sud-Est +1 = 369 m² is driven by a single 348.37 m² room (F19); Atelier +0 room G2 = 244.98 m² is over half that building's 455 m² footprint — flag as possible whole-floor or mis-tagged polygons (both pass the isoperimetric test and read as plausible halls, so confirm rather than assume error). *(reconcile, extraction)*

### LOW

- **Dual-coded labels conflate two lots into one number.** `L2/L10 = 53`, `L4/L11 = 79`, `L9/L12 = 88` — area cannot be cleanly attributed; L10 and L12 have no standalone label. Split during correction. PDF separates them: L10 = 79 (+1), L11 = 107 (+1), L12 = 63 (+1). *(reconcile)*

- **8 rooms missing Nd (elevation), 1 missing Hsp.** Missing Nd: G1, G14→F14, F19, F20, F4, F5, F2, F1 (CSV-blank set exactly matches the raw null-Nd set — nothing lost in extraction). Missing Hsp: F7 (`Hsp:/`). Areas unaffected; only floor-elevation/height cross-checks are blocked for these rooms. *(extraction)*

- **Two >200 m² rooms are plausible halls, not mis-tags — but confirm.** G2 (244.98 m², Atelier +0, Hsp 4.40) and F19 (348.37 m², Aile Sud-Est +1, Hsp 5.61, Nd missing) both pass the isoperimetric test (IPQ 0.607, 0.333). F19 — single largest space + missing Nd — is the higher-attention case. *(extraction)*

### INFO (context, no action on the value)

- **Surveyor +0 room sums are 59–80% of NavVis footprints — expected, not an error.** Aile Ouest 0.70, Aile Sud-Est 0.59, Atelier 0.80, Chapelle 0.80, Maison principale 0.68. Rooms exclude wall thickness/circulation, so net < gross is required; do not expect surveyor room sums to equal emprise footprints. This independently confirms the shared m² unit. *(extraction, assignment, units)*

- **Some corrected labels already match the PDF — fix is de-duplication, not re-measurement.** L2 +0 = 45, L3 (+0 = 49, +1 = 51), L4 +0 = 77, L11 +1 (106.5 vs 107), L1 +1 (71 vs 71) all agree within rounding. Confirm with the user which of each duplicate pair to keep. *(reconcile)*

## 3. Cross-Source Discrepancy Table

**These columns measure different quantities — do not sum or equate across columns.** 6190 = measured interior room area; PDF = approximate lot programme; NavVis = building footprint envelope; 260608 = current DWG label(s) to be corrected.

| Scope | 6190 (interior rooms) | PDF (lot programme, approx.) | NavVis (footprint/emprise) | 260608 current label(s) | Label verdict |
|---|---|---|---|---|---|
| **Totals** | 2409 (45 rooms: +0 1342.35 / +1 1066.49) | 1391 indoor (+0 615 / +1 776; +86 terr dropped) | 1891 (5 emprises) | — | Not comparable across columns |
| **L1** | — | +1 = 71 | — | 61.8 **and** 71 | DUP; 61.8 wrong (−13%), keep 71 |
| **L2 (/L10)** | — | +0 = 45 (L10 = 79 +1) | — | 45 **and** 53 (`L2/L10`) | DUP + dual-coded; split L10 |
| **L3** | — | +0 = 49 / +1 = 51 | — | 49 **and** 51 | DUP; both match PDF — de-dup only |
| **L4 (/L11)** | — | +0 = 77 (L11 = 107 +1) | — | 77 **and** 79 (`L4/L11`) | DUP + dual-coded; split L11 |
| **L5** | — | +0 = 60 (terr 44) | — | 60 **and** 51 | DUP; 51 wrong (−15%), keep 60 |
| **L6** | — | +0 = 58 (terr 42) | — | 58 **and** 52 | DUP; 52 wrong (−10%), keep 58 |
| **L7** | — | +1 = 62 | — | 66 **and** 54 | DUP; 54 wrong (−13%) |
| **L8** | — | +0 = 94 | — | 67.5 **and** 56 | DUP; **both wrong** (56 = −40%) |
| **L9 (/L12)** | — | +0 = 63 (L12 = 63 +1) | — | 89 **and** 88 (`L9/L12`) | DUP + dual-coded; **89 wrong (+41%)** |
| **L11** | — | +1 = 107 | — | 79 (in `L4/L11`) **and** 106.5 | DUP; 106.5 matches, split from L4 |
| **L13** | — | +1 = 78 (approx.) | — | **ABSENT** | MISSING — must be added |
| Maison principale +1 | 288.9 incl. F1 / **127.5 excl. F1** | — | 182.28 | — | 288.9 impossible (>footprint); use 127.5 |
| Aile Sud-Est +1 | 369 (F19 = 348.37 dominates) | — | 449.51 | — | Confirm F19 not whole-floor |
| Atelier +0 | 362.28 (G2 = 244.98) | — | 454.99 | — | Confirm G2 not mis-tagged polygon |
| Aile Ouest +0 | 396.73 | — | 564.27 | — | Ratio 0.70 — OK |
| Chapelle +0 | 192.42 | — | 239.95 | — | Ratio 0.80 — OK |

*Current-DWG "wrong %" is computed against the PDF (approximate) and is pending confirmation of the authoritative source per lot.*

## 4. Recommended Next Actions (before using these areas to correct the 260608 DWG)

1. **Resolve F1 before publishing any per-building total.** Confirm with the user whether the `Grenier` (161.36 m²) belongs to Maison principale or another building. Until resolved, **do not** use the consolidated "Maison principale +1 = 288.9 m²" or any site total that includes F1's attribution; the F1-excluded 127.5 m² is the only currently-defensible MP+1 figure.

2. **Confirm the authoritative area source per lot — do NOT propagate any current DWG label.** Per CLAUDE.md, these are legal/cadastral values: get the user to name the authority (surveyor 6190 vs architect PDF) for each lot. The 6190 surveyor measurements are the interim authority; the PDF is explicitly approximate. None of the conflicting current-DWG values should be assumed validated.

3. **De-duplicate L1–L9 + L11 and split the three dual-coded labels.** For each duplicate pair, confirm which value to keep (several corrected labels — L2, L3, L4, L11, L1 — already match the PDF, so this is de-duplication, not re-measurement). Split `L2/L10`, `L4/L11`, `L9/L12` into separate per-lot labels so L10/L11/L12 each get a standalone area.

4. **Add L13 (and only from a confirmed source).** L13 is genuinely absent; its only current source is the approximate PDF (78 m²). Identify the corresponding 6190 room(s) to validate before writing; do not invent the area.

5. **Fix the worst numeric errors first — L8 and L9.** L8 (labelled 56/67.5 vs PDF 94, −40%) and L9 (labelled 89 vs PDF 63, +41%) are the largest discrepancies and the highest-priority corrections after source confirmation.

6. **State the PDF terrace convention explicitly and stop using 1391 as a control total.** Document that L5/L6 "totals" exclude their 44/42 m² terraces; decide whether cadastral lot areas should include terraces. The 86 m² terrace gap must be a deliberate, documented decision, not a silent drop.

7. **Spot-check the area ≈ perimeter rooms (G3, G6, G9; also F3, F6, F9) against the surveyor source** to confirm the perimeters are real (not a field collision), before treating any P value as authoritative. Areas are usable as-is.

8. **Keep footprint / interior / programme totals on separate rows in all downstream reporting.** Never reconcile 1891 vs 1391 vs 2409 as one quantity; each measures a different thing (envelope vs programme vs interior rooms).

9. **Preserve original layers per standing convention** — write all corrections to a duplicated layer (e.g. `Tekst-ruimtelabel-corrigé`), leaving the originals intact, and deliver the diff (label text) for review.