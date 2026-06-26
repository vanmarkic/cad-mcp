# Bordereau-métré — Toiture Maison principale (mise hors d'eau / réparation)

**Chantier :** Ferme du Temple, Avenue Joseph Wauters 227, 7080 Frameries
**Ouvrage :** Maison principale (corps de logis — le bâtiment en brique : tourelle, lucarnes, versants ardoises partiellement bâchés + terrasson zinc au sommet). C'est le « premier bâtiment logis commun, celui avec la mérule » que cite Adritoit.
**Objet :** document de **consultation** (bordereau-métré) pour que les entreprises (**Adritoit SRL**, **LB Toiture SAV**) chiffrent sur une base commune.
**Nature des travaux :** *mise hors d'eau / réparation* des versants ardoise (reprise des zones dégradées/bâchées) **+ réfection du terrasson zinc** (très dégradé). La réfection complète des versants est proposée en **option** (O1/O2) pour le scénario financement.
**Couverture existante :** ardoise **reconstituée** (déclaré MO) ; pas de contrainte patrimoine annoncée. Le prix **ardoise naturelle** est demandé en variante (V1).

## Deux versions — laquelle envoyer ?

Retour du collectif (Jeremie/Dragan, 14/06) : le métré détaillé fait « trop bureau d'études » et
risque de braquer les couvreurs. On envoie donc la **version simplifiée et ouverte** ; le métré
détaillé reste un **usage interne** (pour juger les offres).

### ✉️ À ENVOYER aux toituriers — 2 documents complémentaires
**1) La demande de prix** (liste des travaux + leur proposition, **sans chiffres**) :
| Fichier | Usage |
|---|---|
| `DEMANDE_DE_PRIX_toiture_logis.docx` | **Word éditable** — pour que Jérémie corrige avant envoi. |
| `DEMANDE_DE_PRIX_toiture_logis.pdf` | Version imprimable/propre. |
| `DEMANDE_DE_PRIX_toiture_logis.xlsx` | Tableau à compléter (colonnes *Votre proposition* + *Prix*). |
| `build_demande_prix.py` | Générateur. |

**2) La fiche Mesures** (nos relevés + comment on les a obtenus) — annexe jointe :
| Fichier | Usage |
|---|---|
| `MESURES_releve_toiture.docx` | **Word éditable**. |
| `MESURES_releve_toiture.pdf` | Imprimable. |
| `build_mesures.py` | Générateur. |

Langage courant (pas de CCTB/QF-QP). La demande reste **ouverte** (large colonne « Votre
proposition »), et toutes les **mesures sont sorties dans la fiche annexe** (surfaces, pourtour,
hauteur, terrasson 5×4, etc.) — présentées comme **estimations à confirmer**.

### 🗄️ USAGE INTERNE — métré détaillé (munition pour analyser les offres)
| Fichier | Usage |
|---|---|
| `BORDEREAU_toiture_maison_principale.xlsx` | Métré détaillé, 41 postes + variantes, total auto. |
| `BORDEREAU_toiture_maison_principale.csv` / `.pdf` | Mêmes données (repli Excel / imprimable). |
| `METHODOLOGIE_metres.md` · `verify_metres.py` | Comment chaque quantité est obtenue (reproductible). |
| `build_bordereau.py` | Générateur de la version détaillée. |
| `EMAIL_couvreur_FR.md` | Brouillon de courriel (à adapter/envoyer). **⚠ gitignoré** : contient le login immovision partagé. |

## Accès au scan 3D (immovision)

Vue cadrée sur la toiture (pour relever des cotes en ligne) :
`https://immopass.iv.navvis.com/?site=3186889630268293&vlon=6.64&vlat=-0.11&fov=150.0&pc=true&clipVolume=…&x=-22.932&y=6.224&z=10.419`

> **Identifiants** (login viewer partagé) : **non écrits ici** — ils sont dans `EMAIL_couvreur_FR.md` (gitignoré) et `navvis_export/ACCESS.md` (gitignoré). Ne jamais committer ce login : le dépôt publie un site GitHub Pages.

**Régénérer :**
```bash
./.venv/bin/python deliverables/bordereau_toiture_maison_principale/build_bordereau.py
```
(dépendances : `openpyxl`, `reportlab` — déjà installées dans `./.venv`).

## Ce qui est fourni / ce qui ne l'est pas

- **Fourni :** la liste structurée des postes (37 postes, 8 chapitres), les unités, et des **quantités présumées (QP)**.
- **Volontairement laissé au couvreur :** les **prix unitaires** — c'est tout l'objet de son offre. Les colonnes P.U./Total sont vides.
- **À confirmer contradictoirement sur site :** quasiment toutes les quantités (voir ci‑dessous). Le décompte final se fait sur **métré réel**.

## Sources des quantités (traçabilité)

| Donnée | Valeur | Source |
|---|---|---|
| Emprise au sol du bâtiment | **182,28 m²** | NavVis, aire shoelace = méta `182,283` (`buildings_summary.json`) |
| Surface développée des versants | **~237 m²** (présumé) | estimatif architecte (`251023 raming.xlsx`) — recoupé : 182,28 / cos(**39,7°**) = 237 m² |
| Périmètre total | **58,40 m** | NavVis (`footprints_local_m.geojson`, shapely) |
| · dont corniche/gouttière (arêtes libres) | **~33,6 m** | arêtes sans bâtiment mitoyen (seuil 0,8 m) — base des postes gouttières |
| · dont solins/noues (arêtes mitoyennes) | **~24,8 m** | contact Aile Ouest 8,8 m + Atelier 16,0 m |
| Hauteur façade → corniche | **~10 m** | relevé MO (façade extérieure) ; cohérent scan : z 8,55 − base −1,5 ≈ 10 m (l'intérieur sol niv.0→corniche ne fait que 7,6 m) — dimensionne l'échafaudage (~335 m²) |
| Pente | **~40°** (présumé) | déduite (39,7°) du rapport surface/emprise — à confirmer |
| Toiture plate / terrasson zinc | **20 m²** (5 × 4 m) | **mesure manuelle MO sur immovision** (outil de mesure point‑à‑point) ; l'archi 67 m² était sur‑estimé / mal attribué |
| Éléments en toiture | 1 tourelle (toit conique) · **2 lucarnes jacobines (zinc cintré) + 1 œil‑de‑bœuf** · ~3 souches | **comptage sur les 10 photos drone Adritoit (11/05/2026)** — à confirmer |

> **Vérification reproductible :** `verify_metres.py` recalcule tout ce tableau depuis le scan. Méthodologie complète : `METHODOLOGIE_metres.md`. L'**étendue des reprises ≈ 50 m²** vient du relevé MO (< ½ versant Nord + ⅓ versant Est) appliqué aux versants répartis depuis 237 m² — pas une mesure d'ouverture, à confirmer.

Les quantités de **reprise** (m² d'ardoises à redéposer, ml de chevrons, etc.) sont des **estimations basses, explicitement présumées**, faute de relevé fin de l'étendue des dégradations : leur seule vocation est de permettre au couvreur de chiffrer ses prix unitaires. Elles **doivent** être arrêtées lors d'une visite.

## Conventions (Belgique / Wallonie)

- **Types de poste :** `QF` forfaitaire · `QP` présumée · `PG` poste global · `SR` somme réservée · `PM` pour mémoire.
- **Mesurage :** réf. **CCTB** (Cahier des Charges-Type Bâtiment, Wallonie) **§34.1 Couvertures** et **§34.2 Étanchéités** ; surface nette de toiture, ml pour les éléments linéaires, pièce pour les éléments ponctuels (NBN B 06‑001).
- **TVA :** montants **HTVA**. La rénovation d'un logement de **plus de 10 ans** peut bénéficier du taux réduit **6 %** (sous conditions) ; sinon **21 %**. À trancher selon le régime du maître d'ouvrage.

## Variantes & options (bloc séparé, NON additionné au total)

Pour répondre aux questions des entreprises et du collectif :
- **V1** — ardoise **naturelle** au lieu de reconstituée (sur zones reprises) → donne le delta de prix demandé par Cathy.
- **V2 / V3** — terrasson : **bitume SBS** ou **EPDM** au lieu du zinc (question d'Adritoit).
- **O1 / O2** — **réfection complète** des versants (237 m²), reconstituée / naturelle → chiffre « fin de vie » pour le financement bancaire.

Le maître d'ouvrage retient une solution selon les prix ; ces lignes ne s'ajoutent pas au TOTAL HTVA (chapitres 0 à 7).

## Limites / honnêteté

- Ce bordereau est un **document d'aide au chiffrage / consultation**, pas un cahier des charges contractuel ni un relevé cadastral.
- Aucune valeur n'a été « inventée » sans la signaler : tout chiffre est soit **sourcé** (tableau ci‑dessus), soit marqué **présumé/à relever**.
- **Surface du terrasson zinc = 20 m² (5 × 4 m)** : **mesurée manuellement par le MO sur immovision** (outil de mesure). À noter : l'outil "Floor" automatique et les coupes pleine‑profondeur ne donnent PAS le terrasson (scanner intérieur) ; seul l'outil de mesure point‑à‑point y arrive. L'estimatif archi (67 m²) le sur‑estimait largement.
- Un **repérage amiante** (poste 1.5) est rappelé : obligation préalable au démontage en Belgique ; l'estimatif archi pointait déjà un doute amiante sur la couverture existante.
- Lien à signaler aux entreprises : un **traitement mérule** est en cours/devisé (Bioprotect, Drive) ; coordination utile sur les sablières et pieds de chevrons (postes 2.3 / 2.5).
- **Choix en attente** (décisions MO) : matériau ardoise (reconstituée vs naturelle), revêtement du terrasson (zinc/bitume/EPDM), et arbitrage réparation vs réfection complète — tous fournis en variantes pour décider au vu des prix.
