# Méthodologie du métré — toiture Maison principale

> Principe : **aucune valeur inventée**. Chaque quantité est soit **mesurée** sur une source
> primaire, soit **recoupée** entre deux sources, soit **présumée** et alors explicitement
> signalée « à confirmer ». Le décompte final se fait sur **métré réel** (visite contradictoire).

## 1. Sources primaires

| Source | Nature | Usage |
|---|---|---|
| `navvis_export/footprints_local_m.geojson` | Scan 3D NavVis / ImmoPass — polygone d'emprise, mètres, repère local | aire, périmètre, arêtes |
| `navvis_export/buildings_summary.json` | Scan NavVis — niveaux (z) par bâtiment | hauteurs |
| Google Drive `251023 raming.xlsx` (estimatif architecte) | Surfaces de toiture + décomposition des postes | surface des versants (237 m²), terrasson plat (67 m²), trame des postes |
| **10 photos drone Adritoit (visite 11/05/2026)** | Vue détaillée versants + terrasson zinc + éléments | comptage tourelle/lucarnes/souches, état du terrasson zinc, nature couverture (ardoise reconstituée), étendue zone membrane/bâche |
| Échange courriels MO ↔ Adritoit (11–12/05/2026) | Décisions & périmètre | couverture = ardoise reconstituée, pas de contrainte patrimoine, demande variantes (naturelle ; terrasson zinc/bitume/EPDM), scope = logis avec mérule |
| CCTB Wallonie §34.1 / §34.2 + NBN B 06‑001 | Référentiel de métré belge | mode de mesurage, types de poste |

**Repère :** coordonnées NavVis‑local en mètres (frame du site, Lambert 2008 sous‑jacent). Aucune
conversion n'est nécessaire pour des longueurs/surfaces (le scan est métrique et à l'échelle 1:1).

## 2. Méthode, mesure par mesure

| Mesure | Méthode | Valeur | Recoupement / contrôle |
|---|---|---|---|
| **Emprise au sol** | Aire du polygone d'emprise par **shoelace** (et shapely) | **182,28 m²** | = métadonnée NavVis `182,283 m²` (écart nul) |
| **Périmètre** | Longueur du polygone (shapely) | **58,40 m** | 11 arêtes, somme contrôlée |
| **Corniche / gouttière (linéaire libre)** | Pour chaque arête, distance du milieu aux **autres emprises** scannées ; seuil **0,8 m** ⇒ libre vs mitoyen | **~33,6 m libre** | mitoyennetés détectées : Aile Ouest (8,8 m), Atelier (16,0 m) = 24,8 m |
| **Solins / noues (linéaire mitoyen)** | idem, arêtes < 0,8 m d'un voisin | **~24,8 m** | cohérent avec la jonction des bâtiments sur plan |
| **Hauteur façade → corniche** | Relevé MO (façade extérieure), recoupé scan | **~10 m** | corniche z 8,55 − base façade z −1,5 ≈ 10 m (le rez est surélevé sur un niveau semi‑enterré ; l'intérieur sol‑niv0→corniche ne fait que 7,6 m) |
| **Surface développée des versants** | **Chiffre architecte** (estimatif) | **~237 m²** | recoupement géométrique : 182,28 / cos(pente) = 237 ⇒ **pente 39,7°**, cohérent pour une toiture en ardoise raide |
| **Pente** | Déduite du couple (emprise, versants) | **~40°** | à confirmer sur site |
| **Échafaudage (surface façade)** | Linéaire libre × hauteur façade | **~336 m²** → arrondi **335** | 33,6 × 10 ; avant déduction des baies |
| **Terrasson plat (zinc)** | **Mesure manuelle MO sur immovision** (outil de mesure point‑à‑point) | **20 m² (5 × 4 m)** | l'outil "Floor" auto et les coupes pleine‑profondeur ne le donnent pas (scanner intérieur) ; estimation géométrique 30–40 m² ; archi 67 m² sur‑estimé |
| **Éléments ponctuels** | **Comptage visuel** sur les 10 photos drone Adritoit | 1 tourelle (toit conique) · **2 lucarnes jacobines (zinc cintré) + 1 œil‑de‑bœuf** · ~3 souches | à confirmer sur site |

Outil : `verify_metres.py` (joint) recalcule tout ceci depuis les sources — sortie reproductible.

## 3. Classification des quantités du bordereau

Les 41 postes (chap. 0 à 7) se répartissent en **trois niveaux de fiabilité** :

1. **Mesurées (géométrie scan)** — corniche 34 m (poste 5.1/5.2), solins mitoyens 25 m (4.5),
   échafaudage 335 m² (0.2 ; 33,6 m × ~10 m de façade), surface de référence des versants 237 m². *Fiables à ±qq %.*
2. **Comptées (photos Adritoit)** — lucarnes jacobines (4.1 = 2), œil‑de‑bœuf (4.2 = 1),
   tourelle (4.3 = 1), souches (4.4 = 3), terrasson zinc **20 m² (5×4, mesure MO immovision)** (ch. 6). *À confirmer sur site.*
3. **Présumées (étendue des dégradations)** — tout ce qui dépend de l'état réel non visible :
   m² d'ardoises à reprendre, ml de chevrons/sablières, voligeage, traitement bois, faîtage,
   noues, ardoises isolées. **Non mesurables sans ouverture.**

   > **Surface de reprise ≈ 50 m²**, établie de façon traçable :
   > 1. les **237 m²** de versants sont répartis par orientation, au prorata de l'avant-toit mesuré
   >    sur le scan : **Nord ~68 m² · Est ~61 m² · Sud ~56 m² · Ouest ~52 m²** (somme = 237 ✓) ;
   > 2. **relevé du maître d'ouvrage** (visuel) : **< ½ du versant Nord** + **⅓ du versant Est** bâchés/dégradés ;
   > 3. reprise = 0,45 × 68 + 0,33 × 61 ≈ **50 m²**.
   >
   > Les postes 1.1, 1.4, 2.4, 2.5, 3.1, 3.2, 3.3 en découlent. `verify_metres.py` recalcule cette
   > répartition. **À confirmer contradictoirement** (la répartition par avant-toit suppose un
   > rampant/pente comparable sur les versants ; « moins de la moitié » a été pris à 0,45).

**Variantes & options (V1–V3, O1–O2)** — bloc séparé, **non additionné au TOTAL HTVA** (le MO retient
une solution selon les prix) : ardoise naturelle vs reconstituée (V1), terrasson bitume/EPDM vs zinc
(V2/V3), réfection complète des versants 237 m² (O1/O2, scénario financement). Quantités sourcées comme
ci-dessus (50 m² reprise, 20 m² terrasson, 237 m² versants).

Les **prix** (P.U./Total) sont volontairement **vides** : c'est l'objet de l'offre du couvreur.

## 4. Conventions de métré (Belgique / Wallonie)

- **Types de poste :** QF forfaitaire · QP présumée · PG poste global · SR somme réservée · PM pour mémoire.
- **Mesurage :** CCTB §34.1 Couvertures (surface nette en m², linéaires en m, éléments en pièce) ;
  §34.2 Étanchéités ; NBN B 06‑001. En rénovation, le prix de couverture inclut la dépose de
  l'existant, l'inspection visuelle de la charpente accessible et les protections.
- **TVA :** montants **HTVA** ; rénovation d'un logement > 10 ans → **6 %** sous conditions, sinon **21 %**.

## 5. Limites — ce qui requiert impérativement la visite

- **Étendue réelle des dégradations** (hypothèse 38 % ci‑dessus) : c'est le facteur n°1 d'incertitude.
- **Pente exacte** et **présence d'amiante** (couverture existante — doute déjà soulevé par l'archi).
- **Décompte exact des lucarnes/souches** (la photo est partielle).
- **Périmètre Maison principale vs maison voûtée** : le chapitre 6 (toiture plate) est en *pour mémoire* ;
  selon l'estimatif archi il relève de la maison voûtée, pas de la maison principale.
- **État de la charpente / sablières** : à recouper avec le **traitement mérule** en cours (devis Bioprotect).

## 6. Reproductibilité

```bash
# vérifier les mesures
./.venv/bin/python deliverables/bordereau_toiture_maison_principale/verify_metres.py
# régénérer le bordereau (CSV + XLSX + PDF)
./.venv/bin/python deliverables/bordereau_toiture_maison_principale/build_bordereau.py
```
