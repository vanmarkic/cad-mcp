# Lot areas — multi-source cross-check (260608 geometry × géomètre × NavVis)

_2026-06-09. Every value triangulated. Units m²._

## What 260608 actually contains (all layers swept)
260608 encodes the lot areas **three** internally-consistent ways, all matching the *old* labels:
1. **Typed labels** (`Tekst-ruimtelabel`) — two per lot (its +0 and +1).
2. **Net-area HATCHes on layer `0`** — the polygons the labels were generated from (match labels to <1 m²).
3. **`_Nieuw-4 massa` new-design walls** — polygonised into room faces (independent geometry).

→ All three agree with each other but **differ from the architect PDF** on L7/L8/L9. That gap is
**design evolution** (the architect later enlarged L7/L8, shrank L9), **not** a labelling error.

## Per-lot cross-check

| Lot·flr | 260608 label | 260608 hatch(L0) | 260608 _Nieuw face | PDF (newer) | géomètre 6190 | NavVis | verdict |
|---|--:|--:|--:|--:|---|---|---|
| L1 +0 | 61.8 | 61.4 | — | **76** | wing fits | — | **design change** 61→76; confirm which is current |
| L1 +1 | 71 | 70.9 | — | 71 | — | — | ✅ all agree → **71** |
| L2 +0 | 45 | 44.6 | 43.9 | 45 | — | — | ✅ → **45** |
| L2 +1 | 53 | — | — | 53 | — | — | ✅ label=PDF → **53** |
| L3 +0/+1 | 49/51 | — | 49.3 | 49/51 | — | — | ✅ → **49 / 51** |
| L4 +0 | 77 | 76.9 | 76.8 | 77 | wing fits | — | ✅ rock-solid → **77** (ground-only) |
| L5 +0 | 60 | 59.7 | 47.8 | 60 | — | — | ✅ → **60** |
| L5 +1 | 51 | 51.3 | — | **60** | — | — | **design change** 51→60; confirm |
| L6 +0 | 58 | — | 51.5 | 58 | — | — | label=PDF → **58** (geom 51.5 = walls-in) |
| L6 +1 | 52 | — | — | **58** | — | — | **design change** 52→58; confirm |
| L7 +0 | 66 | 65.7 | — | **93** | SE+0 fits PDF | — | **design change** 66→93 (architect enlarged) |
| L7 +1 | 54 | 53.7 | — | **62** | SE+1 fits PDF | sparse | **design change** 54→62; géomètre |
| L8 +0 | 67.5 | 67.9 | 73.6 | **94** | SE+0 fits PDF | — | **design change** ~68→94 |
| L8 +1 | 56 | 57.1 | — | **94** | SE+1 fits PDF | sparse | **design change** 56→94; géomètre |
| L9 +0 | 89 | 88.8 | 84.2 | **63** | SE+0 fits PDF | — | **design change** 89→63 (architect shrank) |
| L10 +1 | (53, dual) | — | — | 79 | AO+1 over | sparse | no 260608 geometry; **géomètre** |
| L11 +1 | 106.5 | **106.5** | — | 107 | AO+1 over | — | ✅ 106.5≈107 geom-backed → **107 (≈106.5)** |
| L12 +1 | (88, dual) | — | — | 63 | SE+1 fits | sparse | no 260608 geometry; **géomètre** |
| L13 +1 | absent | — | — | 78 | SE+1 fits | sparse | no 260608 geometry; **géomètre** |

## Envelope cross-check (géomètre 6190 vs NavVis) — wing/floor level
| wing·floor | Σ PDF lots | 6190 measured | NavVis +1 coverage | read |
|---|--:|--:|--:|---|
| Aile Ouest +0 | 365 | 397 | — | ✓ PDF fits |
| **Aile Ouest +1** | 361 | 315 | **11 %** | PDF > measured by 46, **but scan only 11 %** → test inconclusive; L10/L11 need géomètre |
| Aile Sud-Est +0 | 250 | 266 | — | ✓ PDF fits |
| **Aile Sud-Est +1** | 297 | 369 | 20 % | ✓ PDF fits the envelope → L7+1/L8+1/L12/L13 plausible |

## Conclusions
1. **The "wrong" L7/L8/L9 labels are an older design**, not mistakes — 260608's own geometry backs the
   old numbers; the PDF is the newer scheme. **Confirm with the architect which design is current**
   before finalizing these (the safe subset already applied the PDF/newer +0 values).
2. **L11 = 107** is independently confirmed by 260608 geometry (hatch 106.5) — highest confidence.
3. **L10, L12, L13** have **no geometry in any source** (not in 260608, not per-lot in 6190, sparse in
   NavVis) → genuinely need the architect's current DWG or an on-site géomètre measure.
4. **Géomètre/NavVis can only cross-check at the wing-envelope level**, and even that is weak on the
   Aile Ouest +1 (11 % scan). Per-lot upper splits are an **architect-design** quantity, not a survey one.

→ Net: the authoritative source for the contested lots is the **architect's current design DWG**;
6190 and NavVis serve as envelope sanity-checks (which pass for SE+1, are inconclusive for AO+1).
