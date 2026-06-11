# Strategy — resolving the contested upper-floor lots

_2026-06-09. Contested set: **L7 +1, L8 +1, L10, L11, L12, L13** (the F19/F18 envelope splits)._

## 1. 6190 evaluated (the suggested source)
- 6190 = **parcel/land** "plan de division" + room relevé. **No building copropriété division**:
  0 lot/quotité/privatif/copropriété texts, no lot layers. → cannot directly give the L1–L13 split.
- Its first-floor sheet *does* carry dense geometry (667 LINE + 5046 LWPOLYLINE) but mostly hatch;
  even closed room polygons can't be attributed to lots without the architect's room→lot map.
- **Real value of 6190 = an envelope cross-check** (measured floor area per wing).

## 2. Key finding — the envelope-fit test
Net lot areas can't exceed the measured floor envelope. Testing the architect PDF against 6190:

| wing · floor | Σ PDF lots | Σ 6190 measured | verdict |
|---|--:|--:|---|
| Aile Ouest +0 | 365 | 397 | ✓ fits (0.92) |
| **Aile Ouest +1** | **361** | **315** | ❌ PDF **exceeds** measured → **L10=79 / L11=107 over-stated** |
| Aile Sud-Est +0 | 250 | 266 | ✓ fits (0.94) |
| **Aile Sud-Est +1** | **297** | **369** | ✓ fits (0.81) → **L7+1=62, L8+1=94, L12=63, L13=78 plausible** |

## 3. Source ranking for the contested splits
1. **Architect source DWG** (`REFERENCE_SOURCES.md` swisstransfer link) — the designed lot geometry →
   exact design areas for *all* contested lots. **Best; request from user.**
2. **NavVis ortho trace** (`plans_measure/*.png` + `ferme_du_temple_PLANS_navvis_local_m.dxf`
   LOT-TRACE layers) — as-built, cm-precise *where scanned*; +1 coverage sparse (SE 20 %, AO 11 %).
3. **Envelope-validated PDF** — usable interim only where it passes the fit test (**SE+1 yes; AO+1 no**).
4. **6190 room-geometry extraction** — could yield finer as-built rooms, but unattributable to lots
   without the architect's room→lot map (same blocker).
5. **Scaled PDF +1 plan measurement** — quick independent cross-check, imprecise (page space).

## 4. Recommended strategy (triangulate; ≥2 agreeing sources ⇒ accept)
- **Primary action**: obtain the **architect source DWG** → I extract per-lot polygons → exact areas
  for every contested lot (and cross-check vs the envelope test + ortho).
- **Interim now (optional)**: write the **envelope-validated SE+1** values as *provisional*
  (L7+1=62, L8+1=94, L12=63, L13=78) on the `Correction-…-AVERIFIER` layer; **HOLD AO+1 (L10/L11)** —
  the over-statement proves the PDF is wrong there; needs the architect DWG or an on-site géomètre measure.
- **Confidence rule**: accept a contested value when **≥2 independent sources agree within ~10 %**
  (e.g. architect-DWG ≈ ortho-trace, or PDF ≈ envelope-fit). Otherwise flag for on-site measurement.

## 5. What I can do on request
- Parse the architect DWG the moment it's provided (same LibreDWG+ezdxf pipeline).
- Trace the SE+1 / AO+1 partitions on the NavVis ortho where coverage allows, and report measured areas.
- Apply the SE+1 provisional interim to the corrected DWG now (flagged), holding AO+1.
