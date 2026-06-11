# 260608 — Label Correction Proposal (for review before any write)

_2026-06-09. Source-cited before/after for every `Tekst-ruimtelabel` in `260608_FermeduTemple.dwg`.
**Nothing is written to the DWG until this is approved** by the user / géomètre / architect._
Per CLAUDE.md (legal/cadastral; never invent; confirm authority) and `navvis_export/HANDOFF_to_correction_agent.md`.

## Sources & authority

| Tag | Source | Status |
|---|---|---|
| **CUR** | `260608` current labels (`areas/labels_260608_current.csv`) | to be corrected |
| **PDF** | architect surface table (`260512_presentation_light.pdf` p.9) | design intent; **approximate** |
| **6190** | Immo-Geo surveyor measured rooms (`areas/areas_6190_rooms.csv`) | interim authority; per-*room*, not per-lot |
| **AB** | NavVis as-built orthophoto (`orthophotos/*.tiff`, 1–2 cm/px, georeferenced) | precise **where scan coverage exists** |

**Key structural facts (verified):**
- Each lot carries **two stacked labels at one point = its +0 and +1 floor area.** Many are wrong.
- 6190 measures **physical rooms**, which do **not** map 1:1 to architect lots (lots are groupings;
  the +1 of L7/L8/L12/L13 all sit inside one 348 m² envelope F19, etc.). → 6190 cannot supply
  per-lot areas directly; per-lot **as-built** areas require tracing lot outlines on the orthophoto.
- **Upper-floor scan coverage is sparse** (Aile Sud-Est +1 ≈20%, Aile Ouest +1 ≈11%) → the +1 lot
  splits in those wings are **not yet measurable from the scan** and need the géomètre/architect.

## PART A — Lots L1–L13 (the core correction)

Recommended values = architect **PDF** design figures (the only internally-consistent per-lot set
today), pending géomètre confirmation. "✔ keep" = current already matches PDF (de-duplicate only).

| Lot | CUR +0 | CUR +1 | → +0 | → +1 | tot | Verdict / source | Conf |
|----|----|----|----|----|----|----|----|
| **L1** | 61.8 | 71 | **76** | 71 | 147 | +0 wrong (61.8→76 PDF); +1 ✔ keep 71 | med / high |
| **L2** | 45 | 53 | 45 | 53 | 98 | ✔ both match PDF — de-dup only | high |
| **L3** | 49 | 51 | 49 | 51 | 100 | ✔ both match PDF — de-dup only | high |
| **L4** | 77 | (79)* | 77 | — | 77 | +0 ✔; L4 is **ground-only** — remove the `L4/L11=79` +1 here | high |
| **L5** | 60 | 51 | 60 | 60 | 120 | +0 ✔; +1 wrong (51→60 PDF) (+44 m² terrace, excl.) | high |
| **L6** | 58 | 52 | 58 | 58 | 116 | +0 ✔; +1 wrong (52→58 PDF) (+42 m² terrace, excl.) | high |
| **L7** | 66 | 54 | **93** | **62** | 155 | **both wrong**; +1 is inside F19 envelope → **géomètre** | low* |
| **L8** | 67.5 | 56 | **94** | **94** | 188 | **both wrong** (worst: +0 −40%); +1 inside F19 → **géomètre** | low* |
| **L9** | 89 | (88)* | **63** | — | 63 | +0 wrong (89→63, +41% error); L9 **ground-only** | med |
| **L10** | — | (in L2/L10) | — | **79** | 79 | needs its **own** +1 label = 79 (PDF); inside F18 → géomètre | low* |
| **L11** | — | 106.5 | — | **107** | 107 | 106.5 ✔≈107; drop the stray `79` in `L4/L11`; inside F18 → géomètre | med* |
| **L12** | — | (in L9/L12) | — | **63** | 63 | needs its **own** +1 label = 63 (PDF); inside F19 → géomètre | low* |
| **L13** | — | **absent** | — | **78** | 78 | **ADD** at +1 spot beside L12 (PDF); inside F19 → géomètre | low* |

`*low` = value is PDF-approximate AND the as-built confirmation is blocked by sparse +1 scan
coverage → **must be signed off by géomètre/architect before it is treated as final.**

### Dual-coded labels to split (per QA report)
`L2/L10 → 53`, `L4/L11 → 79`, `L9/L12 → 88` each conflate two lots. Clean target (PDF):
- The **+1-only** units are L10=79, L11=107, L12=63, L13=78 — each needs a **standalone** label.
- My reading: the building was re-numbered on +1; the dual tags are transitional. **Architect to
  confirm** the L2↔L10 / L4↔L11 / L9↔L12 correspondence before splitting.

## PART B — Space labels (non-lot)

These are the Maison-principale / Atelier programme. 6190 ground rooms sum close to several
(`salle commune 126` ≈ MP ground rooms G3+G6+G10 = 124.4 as-built). The architect ateliers table
gives: Ateliers Art 140, Atelier Vitrine 32, Studio son 100, Atelier art collaboratif (chapelle)
60, Atelier construction 145, Profession libérale 87.

| Label (CUR) | Likely match | Note |
|---|---|---|
| salle commune / 126 | MP ground (6190 124.4) | ✔ within 1% of as-built |
| atelier/vitrine / 32 | Atelier Vitrine (PDF 32) | ✔ matches |
| atelier construction / 91 **and** / 71 | Atelier construction (PDF 145) | **conflict** — neither matches 145; confirm |
| foyer 61.5, studio 57, régie 18, cabine A 15, cabine B 7, bar/magasin 36, vestiaire 6, stockage 27/5, local vélo 48, local techniques 48 | sub-spaces | cross-check vs 6190/architect — **confirm each** |
| bare `/ 81, /32, /25, /66, /31, /47` | unlabeled areas | identify the space before changing |

→ Space labels need an explicit **per-label source decision** (architect programme vs 6190
as-built); proposed as a second pass after the lots are agreed.

## PART C — Structural fixes (high confidence, independent of values)

1. **De-duplicate**: each lot's two stacked labels become one +0 and one +1 (keep the correct
   value, drop the wrong one) — not two conflicting labels.
2. **Split** the three dual-coded labels into standalone L10 / L11 / L12 (architect to confirm map).
3. **Add L13** (+1, beside L12).
4. **F1 "Grenier" (161 m²)** is mis-assigned in the area files (10.6 m outside Maison principale) —
   exclude from any per-building total; does not affect a lot label directly.
5. All edits on a **duplicated** layer `Tekst-ruimtelabel-corrigé`; originals untouched (engine proven).

## PART D — What needs géomètre/architect sign-off (cannot be closed from data alone)

- **L7, L8, L10, L11, L12, L13 (+1)** — values are PDF-approximate and the as-built scan can't yet
  measure them (sparse +1 coverage). Either accept PDF interim **or** wait for a géomètre trace.
- The **dual-code correspondence** (L2/L10, L4/L11, L9/L12).
- The **terrace convention** (L5 +44, L6 +42 excluded from totals — confirm cadastral intent).
- The **space-label** sources (Part B).

## PART E — Execution (once approved)

1. Apply approved +0/+1 values per lot to `Tekst-ruimtelabel-corrigé` (de-dup, split dual-codes,
   add L13). Originals preserved.
2. Export **DXF** (reliable) and **DWG** via ODA File Converter.
3. Deliver a per-label diff for final review.

**Recommended immediate, zero-risk step:** apply only PART C structural fixes + the **high-confidence
value corrections** (L1+0→76, L5+1→60, L6+1→58, L9+0→63) and the ✔-keep de-dups, and **hold** the
low-confidence +1 splits (L7/L8/L10–L13) for géomètre sign-off.
