# DRAFT lot grouping - Ferme du Temple (6190 rooms -> architect L1..L13)

STATUS: DRAFT / STARTING POINT. Building-constrained (each lot kept in the wing the architect places it in).
Areas are 6190 measured net room areas (m2). Targets are architect PDF lot totals (pdf_lot_table).
AUTHORITY: NavVis 3D scan is most precise; architect DWG/PDF approximate. 6190 vs NavVis differ by design (Jordy).

KEY STRUCTURAL CAVEAT: the architect PDF lots do NOT map 1:1 onto 6190 rooms. Per-wing the PDF two-floor totals run ~100-130 m2 ABOVE the 6190 net. Three 6190 rooms are un-partitioned whole-floor/multi-lot ENVELOPES that the architect subdivides: G25 (129, bottom Aile Ouest), F18 (158, upper Aile Ouest), and above all F19 (348, the ENTIRE Aile Sud-Est upper floor). The +1 areas for L7/L8/L12/L13 all live inside F19 and cannot be attributed to individual lots from 6190 alone. F1 (161, Maison principale upper, 10.85 m outside all footprints) is a separate red-flag artifact, not residential.

| Lot | Building | +0 rooms (6190) | +0 m2 | +1 rooms (6190) | +1 m2 | derived m2 | architect tot | delta | conf | note |
|-----|----------|-----------------|-------|-----------------|-------|-----------|--------------|-------|------|------|
| L1 | Aile Ouest | G7, G9, G11, G12 | 63.4 | F14 | 53.5 | 116.9 | 147 | -30.1 | low | Diagonal/north top of wing. Four small ground rooms (G7-G12) + upper west room F14. Sums 117 vs 147 target; ~30 m2 short - architect lot is larger than captured 6190 rooms. |
| L2 | Aile Ouest | G14 | 36.6 | F13 | 43.0 | 79.6 | 98 | -18.4 | low | Mid-spine. G14 ground + F13 upper. 80 vs 98. F13 is a refined-transform tie (Maison principale vs Aile Ouest) per verifier - boundary-fragile. |
| L3 | Aile Ouest | G17 | 56.1 | F15 | 20.0 | 76.1 | 100 | -23.9 | low | Mid-spine. 76 vs 100. Under target; F15 sits 0.58 m from the Ouest/Maison party wall (low-confidence boundary room). |
| L4 | Aile Ouest | G19 | 63.5 | - | 0.0 | 63.5 | 77 | -13.5 | medium | Ground-only lot (PDF: +0 77, no +1). G19=63.5 vs 77. Single clean ground room, reasonable single-room match. |
| L5 | Aile Ouest | G23 | 48.4 | F16, F17 | 40.2 | 88.6 | 120 | -31.4 | low | Bottom wing. PDF L5 = +0 60 / +1 60 (+44 terrace). Derived 89 vs 120; F16+F17 chosen as upper but could belong to L6/L10. Highly provisional. |
| L6 | Aile Ouest | G25 | 128.8 | - | 0.0 | 128.8 | 116 | +12.8 | low | Bottom big ground room G25=129 vs L6 tot 116 (PDF +0 58 / +1 58 + 42 terr). G25 is a single large 6190 envelope ~2x the architect +0; likely spans L5+L6 ground or includes circulation. Over target. |
| L10 | Aile Ouest | - | 0.0 | - | 0.0 | 0.0 | 79 | -79.0 | low | PDF: +1-only lot (79) sitting where L4 was. NO matching 6190 first-floor room remains after F13-F18 are consumed - 6190 did not partition this upper area. Needs manual split of F18 or new survey. |
| L11 | Aile Ouest | - | 0.0 | F18 | 158.3 | 158.3 | 107 | +51.3 | low | PDF: +1-only lot (107). F18=158 is a single large upper envelope, +51 over target; it almost certainly contains L10 (and part of L11) - F18 must be split between L10 and L11. Largest Aile Ouest upper room. |
| L7 | Aile Sud-Est | G15, G16 | 55.3 | F20 | 20.6 | 75.8 | 155 | -79.2 | low | SE wing top. PDF +0 93 / +1 62. Derived 76 vs 155. G15 flagged by verifier (0.52 m from Chapelle, flips 25% under jitter) - could be Chapelle not SE. Upper area really lives in F19 envelope, not F20. |
| L8 | Aile Sud-Est | G18 | 69.8 | - | 0.0 | 69.8 | 188 | -118.2 | low | PDF +0 94 / +1 94 = 188. Only G18=70 ground matches; the +1 94 is inside the un-partitioned F19 whole-floor envelope (348). Cannot be resolved without splitting F19. Largest shortfall (-118). |
| L9 | Aile Sud-Est | G20 | 69.2 | - | 0.0 | 69.2 | 63 | +6.2 | medium | Ground-only lot (PDF +0 63). G20=69 vs 63 - good single-room match, one of the cleaner ground lots. |
| L12 | Aile Sud-Est | G21 | 28.6 | - | 0.0 | 28.6 | 63 | -34.4 | low | PDF +1-only (63). G21=29 ground used as placeholder; true +1 area is inside F19 envelope. Provisional. |
| L13 | Aile Sud-Est | G22 | 25.6 | - | 0.0 | 25.6 | 78 | -52.4 | low | PDF +1-only (78) - the 'L13 spot'. No partitioned 6190 upper room exists; G22=26 ground is a placeholder only. Real area is within F19 (348). THE weakest lot - needs F19 split / NavVis room areas. |

## Unused / unallocated 6190 rooms in residential wings
- **F19 (348.37 m2, Aile Sud-Est)**: whole upper-floor envelope; supplies +1 for L7, L8, L12, L13 jointly. Must be split manually.
- **G24 (18.06 m2, Aile Sud-Est ground)**: leftover small room (circulation/stair?), not assigned to a lot.

## Non-residential 6190 rooms (no L-lot) - for reference
- Atelier building: G1, G2(245), G4, G5 ground; F2-F5, F7 upper -> architect ateliers (Ateliers Art, Atelier construction, Studio son, Atelier Vitrine, Profession liberale).
- Chapelle: G8(121), G13(72) -> 'Atelier art collaboratif (chapelle)' + shared volume.
- Maison principale: G3, G6, G10 ground; F1(161, flagged), F6, F8-F12 upper -> common program (accueil, salle commune, foyer, bar/magasin). Note: north end of L1 physically overlaps here but the lot is credited to the Aile Ouest spine.
