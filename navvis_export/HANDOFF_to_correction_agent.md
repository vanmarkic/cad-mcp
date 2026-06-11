# HANDOFF — from the NavVis-extraction agent to the 260608-correction agent

_2026-06-09. Shared-file message. We don't have a live channel; this file + WORKLOG.md is it._

## TL;DR — the "wait for point cloud" premise is now outdated
You proposed options that defer upper-floor areas to a pending **point-cloud** phase. Correction:
- **The point cloud is NOT the right tool for plan areas, and isn't needed for them.** NavVis's
  `pointcloud/crop` renders **georeferenced orthophotos** (top-down) — which is the point cloud
  projected straight down. Same source data; the ortho already carries the areal info.
- I have now produced **per-floor orthophotos at 1–2.3 cm/px in exact site coordinates** for all 5
  buildings × {+0,+1} → `navvis_export/orthophotos/` (+ `underlay/*.png` + `.pgw` world files +
  `georef.json`). Validated: footprints trace the scanned walls exactly (`orthophotos/VERIFY_ground.png`).
- So **upper-floor areas can be derived now by tracing the orthophoto partitions** — to cm precision —
  *wherever coverage shows the walls.*

## The real upper-floor constraint = scan COVERAGE, not precision (and the cloud can't fix it)
+1 coverage is uneven: Atelier+1 ≈54%, Chapelle+1 ≈35%, **Aile Sud-Est+1 ≈20%, Maison principale+1
≈16%, Aile Ouest+1 ≈11%**. Where a partition wasn't walked, neither ortho nor point cloud recovers
it. The F19/F18 envelopes live on the sparsest floors — so those specific upper splits may still need
the **géomètre/architect**, not the scan. I can re-crop at other cut heights to catch more returns.

## What's ready for you in navvis_export/  (UPDATED — full as-built set now delivered)
- `areas/areas_6190_rooms.csv` — 45 surveyor rooms (area, Hsp, perim, building, +0/+1), QA'd (`QA_REPORT.md`).
- `areas/AREAS_consolidated.md` — 6190 + PDF lots + ateliers + current-260608 labels, with caveats baked in.
- `areas/labels_260608_current.csv` — your correction target (dup/conflicting L1–L9, L13 absent).
- **`orthophotos/`** — 10 georeferenced floor-plan TIFFs (1–2.3 cm/px, site coords) + `.pgw` world files +
  `georef.json` + `underlay/*.png`. `VERIFY_ground.png` proves footprints trace the scanned walls.
- **`plans_measure/*.png`** — measurement-ready: each floor's ortho + 1 m grid + 6190 rooms/areas. Trace lots here.
- **`ferme_du_temple_PLANS_navvis_local_m.dxf`** — those orthophotos placed as image underlays (PLAN-0/PLAN-1)
  + footprints + 6190 rooms + empty **LOT-TRACE-0/-1** layers. Trace lots over the real plan → read areas.
- **`facades_coupes_aligned/`** — elevations + coupes cut on **each building's own wall axis** (true
  orthographic; buildings are 5–16° off the site grid) + `facade_heights_aligned.csv`. Placed at true
  z-scale in `ferme_du_temple_ELEVATIONS_m.dxf`. (The old `facades_coupes/` cardinal set is superseded.)
- **`site_plans.pdf`** (+ ground/first) — printable A1 whole-farm plans ~1:114 with footprints + 6190 rooms + scale.

## Coverage caveat for YOUR upper-floor splits (important)
+1 scan coverage: Atelier 54 %, Chapelle 35 %, **Aile Sud-Est 20 %, Maison principale 16 %, Aile Ouest 11 %**.
The F19 (Aile Sud-Est +1) and F18 (Aile Ouest +1) envelopes sit on the THINNEST-scanned floors, so their
partition walls are only partly visible in the ortho. Where visible → trace = cm-precise; where not → the
upper-lot split must come from the **architect/géomètre**, not the scan. Ground-floor splits are clean.

## Candidate per-lot areas — status
Per-LOT as-built areas still need the lot↔room grouping (your open blocker) — I did NOT auto-invent them
(legal caution). The **6190 per-room areas remain the measured interim**, now positioned on the as-built
plans (`plans_measure/`) so you/architect/géomètre can trace each lot and read its area directly.

## My read on your 4 options
- **(B) Wait for point cloud** — drop it; waiting buys nothing for areas (see above).
- **(D) Build a correction proposal doc** — RECOMMENDED primary. Per CLAUDE.md (legal/cadastral, never
  invent, confirm authority), produce a source-cited before/after for every label — now with a THIRD
  **as-built (orthophoto-traced)** column beside 6190 and PDF. Get géomètre/user approval, THEN write.
- **(A) Apply PDF interim** / **(C) certain de-dups only** — both become safe, executable *after* the
  proposal is approved. (C) is the safe minimal immediate step; (A) writes approximate PDF values into a
  legal doc pre-approval (riskier) — gate it on confirmation.

— extraction agent
