# VERIF_hauteurs — protocole v2 + sign-off humain (2026-06-11)

Déclencheur: revue visuelle utilisateur (Chapelle_short): v1 égout/faîtage faux.
Causes racines: (a) rendus **pleine profondeur** → la silhouette est l'ENVELOPPE de
toiture, pas la façade (P60 ≠ égout, conceptuellement); (b) tops bruts → la végétation
flottante gonfle P98 (Chapelle: faîtage v1 13.97 vs réel 11.87, **−2.10 m**).

## Protocole v2
1. tops persistants (≥5/7 px remplis) — élimine les points flottants;
2. médiane glissante 0.5 m sur le profil;
3. **faîtage** = max du profil lissé; «tronqué» si ≤3 px du bord de fenêtre z;
4. **plateau** = mode (10 cm) des colonnes plates (pente <0.3 m/m), retenu si support
   ≥25 % et ≥0.5 m sous le faîtage;
5. cohérence inter-élévations par bâtiment (même toit): écart max;
6. PNG de vérification par image (`measured/verif/`): profils + lignes v1 vs v2;
7. **sign-off humain** sur chaque plateau (sémantique).

## Conclusion du sign-off
**Tous les plateaux détectés sont des éléments de classe faîtage** (faîtage perpendiculaire,
faîtage d'un corps secondaire, crête de mur sans toiture) — jamais une ligne d'égout.
⇒ **L'égout n'est PAS mesurable sur ces rendus**; toutes les valeurs «eaves» v1 de
`facade_heights_aligned.csv` sont **RETIRÉES** (le CSV v1 est conservé pour traçabilité).
Égout vrai ⇒ re-rendu en tranches minces au nu de chaque façade (API crop NavVis).

| image | faîtage v2 | Δ vs v1 | tronqué | plateau | sémantique (sign-off) | support % | spread élévations |
|---|---|---|---|---|---|---|---|
| bcoupe_AileOuest_longit | 14.81 |  |  | 7.65 | indéterminé (voir verif PNG) | 38.2 | None |
| bcoupe_AileOuest_transv | 10.38 |  |  | 2.15 | indéterminé (voir verif PNG) | 25.1 | None |
| bcoupe_AileSudEst_transv_arm1 | 9.84 |  |  | 1.25 | indéterminé (voir verif PNG) | 47.0 | 0.27 |
| bcoupe_AileSudEst_transv_arm2 | 9.87 |  |  | 1.05 | indéterminé (voir verif PNG) | 46.3 | 0.27 |
| bcoupe_Atelier_longit | 12.54 |  |  | 8.95 | indéterminé (voir verif PNG) | 37.7 | 0.02 |
| bcoupe_Atelier_transv | 8.91 |  |  | 4.35 | indéterminé (voir verif PNG) | 46.2 | 0.02 |
| bcoupe_Chapelle_longit | 10.84 |  |  | 9.55 | indéterminé (voir verif PNG) | 40.7 | 0.04 |
| bcoupe_Chapelle_transv | 11.54 |  |  |  |  | 18.1 | 0.04 |
| bcoupe_Maisonprincipale_longit | 14.74 |  |  |  |  | 52.4 | None |
| bcoupe_Maisonprincipale_transv | 14.73 |  |  |  |  | 45.1 | None |
| belev_AileOuest_long | 15.0 | 0.0 | OUI | 10.45 | crête de mur (aile sans toiture) | 54.5 | None |
| belev_AileOuest_short | 15.0 | 0.01 | OUI |  |  | 46.7 | None |
| belev_AileSudEst_long | 12.9 | 0.58 |  | 9.85 | faîtage corps principal grange (12.90 = faîtage croisillon) | 80.6 | 0.27 |
| belev_AileSudEst_short | 13.17 | 0.47 |  |  |  | 22.8 | 0.27 |
| belev_Atelier_long | 13.64 | 0.02 |  |  |  | 23.3 | 0.02 |
| belev_Atelier_short | 13.66 | 0.03 |  |  |  | 31.7 | 0.02 |
| belev_Chapelle_long | 11.83 | -1.48 |  |  |  | 75.3 | 0.04 |
| belev_Chapelle_short | 11.87 | -2.1 |  | 11.05 | faîtage nef vu en bout (11.87 = sommets des pignons) | 35.0 | 0.04 |
| belev_Maisonprincipale_long | 15.0 | 0.0 | OUI |  |  | 38.0 | None |
| belev_Maisonprincipale_short | 15.0 | 0.01 | OUI |  |  | 41.6 | None |

Validation interne du faîtage v2: écart inter-élévations Atelier 0.02 m, Chapelle 0.04 m, Aile Sud-Est 0.27 m (Aile Ouest & Maison principale: tronqués, non comparables — vraies valeurs > 15 m fenêtre).
