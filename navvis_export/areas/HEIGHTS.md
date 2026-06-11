# Heights — Ferme du Temple

## 1. NavVis storey heights (floor-to-floor, from scan z-levels)
> Top storey of each building shows an 'open-to-sky' z cap — ignore its height (true ridge/eaves height ⇒ point-cloud phase).

| bâtiment | niveau | z_base | z_top | H étage m | fiable |
|---|---|--:|--:|--:|:--:|
| Aile Ouest | -1 | -1.58 | 0.31 | 1.89 | ✓ |
| Aile Ouest | 0 | 0.31 | 4.61 | 4.3 | ✓ |
| Aile Ouest | 1 | 4.61 | 34.61 | 30.0 | ✗ open-to-sky cap (ignore height) |
| Aile Sud-Est | 0 | -0.86 | 3.21 | 4.07 | ✓ |
| Aile Sud-Est | 1 | 3.21 | 33.21 | 30.0 | ✗ open-to-sky cap (ignore height) |
| Atelier | 0 | -0.54 | 3 | 3.54 | ✓ |
| Atelier | 1 | 3 | 33 | 30 | ✗ open-to-sky cap (ignore height) |
| Chapelle | 0 | -0.78 | 3.49 | 4.27 | ✓ |
| Chapelle | 1 | 3.49 | 33.49 | 30.0 | ✗ open-to-sky cap (ignore height) |
| Maison principale | -1 | -2.71 | 0.95 | 3.66 | ✓ |
| Maison principale | 0 | 0.95 | 4.88 | 3.93 | ✓ |
| Maison principale | 1 | 4.88 | 8.55 | 3.67 | ✓ |
| Maison principale | 2 | 8.55 | 38.55 | 30.0 | ✗ open-to-sky cap (ignore height) |

## 2. 6190 clear ceiling heights (Hsp) — per room, summarized
| bâtiment | étage | n pièces | Hsp min | Hsp max | Hsp médian |
|---|---|--:|--:|--:|--:|
| Aile Ouest | +0 | 9 | 2.6 | 10.55 | 3.38 |
| Aile Ouest | +1 | 6 | 2.42 | 5.4 | 2.65 |
| Aile Sud-Est | +0 | 7 | 2.8 | 3.31 | 3.31 |
| Aile Sud-Est | +1 | 2 | 3.77 | 5.61 | 4.69 |
| Atelier | +0 | 4 | 3.06 | 4.4 | 3.43 |
| Atelier | +1 | 4 | 2.34 | 7.91 | 3.83 |
| Chapelle | +0 | 2 | 3.97 | 11.7 | 7.83 |
| Maison principale | +0 | 3 | 3.36 | 3.63 | 3.63 |
| Maison principale | +1 | 7 | 3.45 | 5.74 | 3.45 |

## 3. Façade / ridge heights
⚠️ True façade & ridge heights are **not** reliably in the scan metadata (top-storey z is capped). They require the **point-cloud phase** (project a vertical slice and read eaves/ridge). Deferred to phase 3.

Note: double-height volumes are visible in the data — e.g. Aile Ouest G25 Hsp 10.55 m, Chapelle G8 Hsp 11.70 m.