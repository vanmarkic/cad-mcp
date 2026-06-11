# Sidecar — `ferme_du_temple_FACADES_COUPES_mesures.dxf` + `facades_coupes_aligned/measured/`

**Façades & coupes MESURÉES (rev. C — valeurs vérifiées protocole v2)**.
Document de travail (2026-06-11) — **ne pas utiliser pour acte**.

## History — why rev. C
rev. B (P60 "égout" / P98 "faîtage" from `facade_heights_aligned.csv`) **failed user visual
review** (Chapelle_short: both lines visibly wrong). Root causes: full-depth renders make the
top silhouette a **roof envelope** (no gutter line in it), and raw column-tops catch floating
vegetation (Chapelle faîtage was +2.10 m too high). A verification protocol was built →
`facades_coupes_aligned/VERIF_hauteurs.md` (protocol v2 + human sign-off); values now come from
`facade_heights_verified.csv`. **All v1 «égout» values are retracted.**

## What is measured (and what deliberately is NOT)
| measure | derivation | status |
|---|---|---|
| **H faîtage** (élévations) / **H sommet** (coupes) | max of the 0.5 m-median-smoothed profile of *persistent* column tops (≥5/7 filled px — vegetation-proof) | verified; cross-élévation agreement 0.02–0.27 m where un-clipped |
| **plateaux secondaires** | mode of flat-slope columns, ≥0.5 m below max, support ≥25 % — each one **visually identified** (sign-off table): nave ridge seen end-on, secondary-body ridge, wall crest | semantics in label |
| **largeur structure** | content extent × m/px (`aligned_specs.json`) | as rev. B |
| **TN** | min `scs_z_min` (NavVis site model) | as rev. B |
| **égout** | — | **ABSENT BY PROTOCOL**: not measurable from full-depth envelopes. Needs thin façade-plane re-renders (NavVis crop API) if required |

## Flags
- `≥ (tronqué fenêtre z)` — ridge clipped by the −2…+15 m window (Aile Ouest, Maison
  principale): true value is **higher**; re-render with taller window to resolve.
- TN −2.71 (Maison principale) below window → line clamped, labeled.
- Heights relative to NavVis site z (not DNG/TAW); ±2–5 cm cloud, statistics class ±10 cm.

## Files
- DXF: layers `MESURES` (DIMENSION entities), `LIGNES-NIVEAU`, `GRID-1M` (off), `Z-SCALE`,
  `TITRES`, `NOTES`. Keep inside `navvis_export/` (relative image paths).
- PNG: `facades_coupes_aligned/measured/<Building>_mesures.png` + `CONTACT_mesures.png`.
- Verification evidence: `facades_coupes_aligned/measured/verif/*_verif.png` (profiles +
  v1-vs-v2 lines), `facades_coupes_aligned/VERIF_hauteurs.md` (protocol + sign-off table).

## Provenance chain
Point cloud → aligned crops (`scripts/build_aligned_elevations.py`, specs in
`facades_coupes_aligned/aligned_specs.json`) → **verification** (`scripts/verify_facade_heights.py`
→ `facade_heights_verified.csv`) → this set (`scripts/build_measured_facades.py`).

## Regenerate
```
cd /Users/dragan/Documents/cad-mcp
./.venv/bin/python navvis_export/scripts/verify_facade_heights.py     # protocol + evidence
./.venv/bin/python navvis_export/scripts/build_measured_facades.py    # DXF + PNGs
```
