# Room-level areas — Ferme du Temple (consolidated)

Provenance order of authority: **NavVis as-built** (buildings only, no rooms) > **6190 surveyor** (per-room, interim) > **architect PDF** (lots, approximate).

> ⚠️ **Caveats (voir QA_REPORT.md):**
> 1. Les **trois totaux ne sont PAS comparables**: NavVis 1891 m² = somme des **emprises** (enveloppe), 6190 2409 m² = **pièces intérieures** (45, sur 2 étages), PDF 1391 m² = **programme lots** (indoor).
> 2. F1 «Grenier» (161 m²) est **hors emprise** (assignation non vérifiée) → la somme Maison principale +1 est gonflée; voir colonne *inside* et la note de sommes.
> 3. Le total PDF 1391 **exclut 86 m² de terrasses** (L5 44, L6 42) — convention non documentée.
> 4. Les étiquettes 260608 actuelles sont **doublées/contradictoires** (à corriger), L13 absent.

## A. 6190 surveyor — measured rooms (authoritative interim)
45 rooms; each carries Aire (area), Hsp (clear height), P (perimeter), Nd (floor elevation, Lambert Z).
Assigned to NavVis buildings via refined transform (ground 100% inside, first 95%, mean resid 0.24 m).

| id | étage | bâtiment | Aire m² | Hsp m | P m | Nd(z) | inside | dist m |
|---|---|---|--:|--:|--:|--:|:--:|--:|
| G25 | +0 | Aile Ouest | 128.84 | 10.55 | 73.93 | 97.61 | ✓ | 0.0 |
| G19 | +0 | Aile Ouest | 63.48 | 3.97 | 33.32 | 97.25 | ✓ | 0.0 |
| G17 | +0 | Aile Ouest | 56.11 | 3.6 | 31.46 | 97.56 | ✓ | 0.0 |
| G23 | +0 | Aile Ouest | 48.37 | 3.57 | 28.23 | 97.4 | ✓ | 0.0 |
| G14 | +0 | Aile Ouest | 36.57 | 3.33 | 25.12 | 97.6 | ✓ | 0.0 |
| G7 | +0 | Aile Ouest | 19.42 | 3.1 | 17.78 | 97.6 | ✓ | 0.0 |
| G9 | +0 | Aile Ouest | 18.91 | 2.6 | 18.91 | 97.6 | ✓ | 0.0 |
| G12 | +0 | Aile Ouest | 12.7 | 3.32 | 14.26 | 97.6 | ✓ | 0.0 |
| G11 | +0 | Aile Ouest | 12.33 | 3.38 | 13.79 | 97.6 | ✓ | 0.0 |
| G18 | +0 | Aile Sud-Est | 69.8 | 3.31 | 33.81 | 96.5 | ✓ | 0.0 |
| G20 | +0 | Aile Sud-Est | 69.15 | 3.31 | 33.69 | 96.5 | ✓ | 0.0 |
| G21 | +0 | Aile Sud-Est | 28.6 | 3.31 | 22.38 | 96.48 | ✓ | 0.0 |
| G16 | +0 | Aile Sud-Est | 28.16 | 3.23 | 22.05 | 96.46 | ✓ | 0.0 |
| G15 | +0 | Aile Sud-Est | 27.12 | 2.93 | 21.94 | 96.38 | ✓ | 0.0 |
| G22 | +0 | Aile Sud-Est | 25.59 | 3.31 | 20.26 | 96.48 | ✓ | 0.0 |
| G24 | +0 | Aile Sud-Est | 18.06 | 2.8 | 17.02 | 96.89 | ✓ | 0.0 |
| G2 | +0 | Atelier | 244.98 | 4.4 | 71.22 | 96.33 | ✓ | 0.0 |
| G1 | +0 | Atelier | 68.58 | 3.8 | 33.15 | None | ✓ | 0.0 |
| G5 | +0 | Atelier | 27.63 | 3.06 | 21.7 | 96.33 | ✓ | 0.0 |
| G4 | +0 | Atelier | 21.09 | 3.06 | 18.43 | 96.33 | ✓ | 0.0 |
| G8 | +0 | Chapelle | 120.73 | 11.7 | 48.78 | 96.3 | ✓ | 0.0 |
| G13 | +0 | Chapelle | 71.69 | 3.97 | 44.06 | 96.3 | ✓ | 0.0 |
| G3 | +0 | Maison principale | 66.58 | 3.63 | 66.58 | 97.58 | ✓ | 0.0 |
| G6 | +0 | Maison principale | 32.47 | 3.63 | 32.46 | 97.58 | ✓ | 0.0 |
| G10 | +0 | Maison principale | 25.39 | 3.36 | 21.58 | 97.58 | ✓ | 0.0 |
| F18 | +1 | Aile Ouest | 158.26 | 5.4 | 70.03 | 101.26 | ✓ | 0.0 |
| F14 | +1 | Aile Ouest | 53.54 | 2.42 | 34.65 | None | ✓ | 0.0 |
| F13 | +1 | Aile Ouest | 42.99 | 2.7 | 49.03 | 101.26 | ✓ | 0.0 |
| F17 | +1 | Aile Ouest | 27.05 | 2.65 | 21.34 | 101.26 | ✓ | 0.0 |
| F15 | +1 | Aile Ouest | 20.0 | 2.65 | 17.94 | 101.26 | ✓ | 0.0 |
| F16 | +1 | Aile Ouest | 13.19 | 2.65 | 14.66 | 101.26 | ✓ | 0.0 |
| F19 | +1 | Aile Sud-Est | 348.37 | 5.61 | 114.61 | None | ✓ | 0.0 |
| F20 | +1 | Aile Sud-Est | 20.55 | 3.77 | 18.32 | None | ✓ | 0.0 |
| F4 | +1 | Atelier | 23.89 | 5.13 | 22.24 | None | ✓ | 0.0 |
| F3 | +1 | Atelier | 19.38 | 2.52 | 19.29 | 100.42 | ✓ | 0.0 |
| F7 | +1 | Atelier | 18.72 | None | 17.68 | 100.42 | ✓ | 0.0 |
| F5 | +1 | Atelier | 18.23 | 2.34 | 17.13 | None | ✓ | 0.0 |
| F2 | +1 | Atelier | 13.44 | 7.91 | 14.72 | None | ✓ | 0.0 |
| F1 | +1 | Maison principale | 161.36 | 5.74 | 50.86 | None | · | 10.62 |
| F12 | +1 | Maison principale | 26.51 | 3.45 | 20.66 | 101.56 | ✓ | 0.0 |
| F8 | +1 | Maison principale | 22.67 | 3.45 | 19.06 | 101.56 | ✓ | 0.0 |
| F11 | +1 | Maison principale | 22.35 | 3.45 | 19.25 | 101.56 | ✓ | 0.0 |
| F10 | +1 | Maison principale | 21.68 | 3.45 | 20.06 | 101.56 | ✓ | 0.0 |
| F9 | +1 | Maison principale | 17.55 | 3.45 | 18.0 | 101.56 | ✓ | 0.0 |
| F6 | +1 | Maison principale | 16.76 | 3.45 | 16.48 | 101.56 | ✓ | 0.0 |

### Sommes par bâtiment / étage (6190 rooms)
> ⚠️ Les pièces marquées *non-inside* (assignation bâtiment NON vérifiée — hors emprise) sont comptées séparément. Une somme d'étage NE PEUT PAS dépasser l'emprise du bâtiment ; si c'est le cas, l'assignation est suspecte (voir QA_REPORT.md).
| bâtiment | emprise NavVis m² | +0 (inside) n/Σ | +1 (inside) n/Σ | +1 incl. non-inside |
|---|--:|--:|--:|--:|
| Aile Ouest | 564.27 | 9 / 396.7 | 6 / 315.0 | — |
| Aile Sud-Est | 449.51 | 7 / 266.5 | 2 / 368.9 | — |
| Atelier | 454.99 | 4 / 362.3 | 5 / 93.7 | — |
| Chapelle | 239.95 | 2 / 192.4 | 0 / 0.0 | — |
| Maison principale | 182.28 | 3 / 124.4 | 6 / 127.5 | 7 / 288.9 ⚠️ |

**Pièces à assignation NON vérifiée (hors emprise):** F1 (161.36 m², Maison principale?, dist 10.62 m)

**Σ 6190 rooms: +0 = 1342.3 m² · +1 = 1066.5 m² · total = 2408.8 m²** (45 rooms)

## B. Architect PDF surface table — LOTS (approximate, authoritative for layout)
| lot | +0 | +1 | +2 | terr | total | type |
|---|--:|--:|--:|--:|--:|---|
| L1 | 76 | 71 |  |  | 147 | |
| L2 | 45 | 53 |  |  | 98 | |
| L3 | 49 | 51 |  |  | 100 | |
| L4 | 77 |  |  |  | 77 | |
| L5 | 60 | 60 |  | 44 | 120 | |
| L6 | 58 | 58 |  | 42 | 116 | |
| L7 | 93 | 62 |  |  | 155 | |
| L8 | 94 | 94 |  |  | 188 | |
| L9 | 63 |  |  |  | 63 | |
| L10 |  | 79 |  |  | 79 | |
| L11 |  | 107 |  |  | 107 | |
| L12 |  | 63 |  |  | 63 | |
| L13 |  | 78 |  |  | 78 | |

**Σ lots (PDF) = 1391 m²**

## C. Architect ateliers (programme)
| atelier | m² |
|---|--:|
| Ateliers Art | 140 |
| Atelier Vitrine | 32 |
| Studio son | 100 |
| Atelier art collaboratif (chapelle) | 60 |
| Atelier construction | 145 |
| Profession liberale | 87 |

**Σ ateliers = 564 m²**

## D. 260608 — étiquettes actuelles (à corriger)
| texte | layer |
|---|---|
| salle commune / 126 m² | Tekst-ruimtelabel |
| atelier/vitrine / 32 m² | Tekst-ruimtelabel |
| foyer / 61.5 m² | Tekst-ruimtelabel |
| bar/magasin/accueil / 36 m² | Tekst-ruimtelabel |
| régie / 18 m² | Tekst-ruimtelabel |
| studio / 57 m² | Tekst-ruimtelabel |
| cabine A / 15 m² | Tekst-ruimtelabel |
| cabine B / 7 m² | Tekst-ruimtelabel |
| stockage / 27 m² | Tekst-ruimtelabel |
| vestiaire / 6 m² | Tekst-ruimtelabel |
| L2 / 45 m² | Tekst-ruimtelabel |
| L3 / 49 m² | Tekst-ruimtelabel |
| L4 / 77 m² | Tekst-ruimtelabel |
| L5 / 60 m² | Tekst-ruimtelabel |
| L6 / 58 m² | Tekst-ruimtelabel |
| L7 / 66 m² | Tekst-ruimtelabel |
| L8 / 67.5 m² | Tekst-ruimtelabel |
| L9 / 89 m² | Tekst-ruimtelabel |
| atelier construction / 91 m² | Tekst-ruimtelabel |
| local vélo / 48 m² | Tekst-ruimtelabel |
| stockage / 5 m² | Tekst-ruimtelabel |
| / 81 m² | Tekst-ruimtelabel |
| / 32 m² | Tekst-ruimtelabel |
| / 25 m² | Tekst-ruimtelabel |
| / 66 m² | Tekst-ruimtelabel |
| / 31 m² | Tekst-ruimtelabel |
| / 47 m² | Tekst-ruimtelabel |
| L1 / 61.8 m² | Tekst-ruimtelabel |
| L2/L10 / 53 m² | Tekst-ruimtelabel |
| L3 / 51 m² | Tekst-ruimtelabel |
| L4/L11 / 79 m² | Tekst-ruimtelabel |
| L5 / 51 m² | Tekst-ruimtelabel |
| L6 / 52 m² | Tekst-ruimtelabel |
| L7 / 54 m² | Tekst-ruimtelabel |
| L8 / 56 m² | Tekst-ruimtelabel |
| L9/L12 / 88 m² | Tekst-ruimtelabel |
| local techniques / 48 m² | Tekst-ruimtelabel |
| L1 / 71 m² | Tekst-ruimtelabel |
| L11 / 106.5 m² | Tekst-ruimtelabel |
| atelier construction / 71 m² | Tekst-ruimtelabel |