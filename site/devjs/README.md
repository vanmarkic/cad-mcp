# ÉTABLI — devis menuisier (+ calepinage)

Application d'une seule page (`index.html`, React via CDN, sans build) pour
générer des devis de menuiserie. Deux faces : **Atelier** (coûts, marge, métré —
back-office) et **Devis client** (imprimable, sans coût ni marge).

## TVA à taux mixtes (fournitures ≠ facture)

Dans **« 03 — Ajustements »**, deux taux de TVA :

- **Taux de TVA** — taux principal (main-d'œuvre, forfaits, déplacement),
  p. ex. **6 %** rénovation d'un logement > 10 ans ;
- **TVA fournitures** — taux dédié aux lignes *fourniture*, p. ex. **21 %**
  pour du matériel livré sans pose. Laisser sur *« Même taux »* applique le
  taux principal partout (comportement d'origine).

Et **au cas par cas** : chaque ligne *fourniture* a un champ **« TVA de cette
ligne »** (vide = taux fournitures du devis) pour forcer un taux sur une seule
fourniture. Priorité : cocontractant (0 %) > override de la ligne > TVA
fournitures du devis > taux principal.

Quand les taux diffèrent, le devis (atelier **et** feuille client) affiche
la **ventilation de la TVA par taux** — base HTVA + TVA pour chaque taux —,
comme l'exige une facture belge à taux mixtes. Une remise globale est répartie
au prorata du HT entre les taux. Pour un client **professionnel
(cocontractant)**, l'autoliquidation (0 %) prime sur tout.

## Catalogue de fournitures réutilisables

Bouton **« Catalogue »** dans la barre du haut. On encode une fourniture une
seule fois (désignation, prix d'achat, unité, marge, TVA) et on la retrouve
ensuite de trois façons :

- **Mémoriser** : sur une ligne *fourniture* de l'atelier, l'étoile **☆**
  enregistre la ligne au catalogue (dédoublonnée par désignation — réencoder
  « MDF 18mm » met à jour l'article, ne le duplique pas).
- **Auto-complétion** : en tapant la désignation d'une ligne fourniture, une
  liste déroulante propose les articles du catalogue ; un clic remplit d'un coup
  désignation, prix d'achat, unité, marge et TVA.
- **Modale « Catalogue »** : recherche, **« Insérer »** (ajoute une ligne
  fourniture pré-remplie au devis) et **« Suppr. »** pour gérer la liste.

Le catalogue est stocké dans `etabli:catalogue` et **inclus dans la
sauvegarde/restauration** (fusionné par désignation, sans perte).

## Sauvegarde / restauration de toutes les données

Les données vivent dans le `localStorage` du navigateur — donc liées à ce poste
et à ce navigateur. Pour les mettre à l'abri (ou passer d'une machine à l'autre),
**Réglages → « Sauvegarde des données »** :

- **Sauvegarder (télécharger)** exporte **tout** (réglages entreprise + valeurs
  par défaut, **tous les devis**, le **catalogue de fournitures** et le
  calepinage en cours) dans un seul fichier `etabli-sauvegarde-AAAA-MM-JJ.json`
  à garder au chaud (autre disque, cloud…).
- **Restaurer…** réimporte un tel fichier : les réglages et le calepinage sont
  remplacés, tandis que les devis (par `id`) et le catalogue (par désignation)
  de la sauvegarde sont **fusionnés** avec les tiens — un même élément est mis à
  jour, les autres sont ajoutés, **rien n'est jamais supprimé**. Un fichier
  étranger (mauvaise app / JSON cassé) est refusé avec un message clair, sans
  rien toucher.

## Calepinage de panneaux (cutlist)

Bouton **« Calepinage »** dans la barre du haut. Les panneaux s'achètent
entiers : on saisit la cote du panneau (mm) et le prix matière (€/m²), on liste
les pièces à débiter (longueur × largeur, en mm), et l'outil calcule :

- le **nombre de panneaux entiers** à commander ;
- le **calepinage** (schéma de découpe par panneau, SVG) ;
- la **chute** (%) et le **coût matière** ;
- une **liste de débit** tabulée, à copier/coller pour le fournisseur ;
- un bouton **« Ajouter au devis »** qui crée une ligne fourniture
  (N panneaux × coût/panneau).

### Plusieurs matériaux dans un même calepinage

On peut empiler **plusieurs types de panneaux** (ex. MDF 18 mm à 30 €/m² **et**
aglo blanc 8 mm à 15 €/m²) via les **onglets « Matière »** en haut de la modale.
Chaque matériau a sa propre cote, son prix, son sens du fil et sa liste de
pièces ; on ne mélange jamais deux matières sur une même plaque, donc chacune
est calepinée et chiffrée **indépendamment**. Quand au moins deux matières sont
chiffrées, un bandeau de total affiche les panneaux/coût cumulés et le bouton
**« Ajouter tout au devis »** crée **une ligne fourniture par matériau** d'un
seul coup (chacune avec son propre coût/panneau et sa marge).

L'algorithme est un *bin packing « guillotine »* tenant compte du trait de
scie, porté depuis [bdfinst/cutlist](https://github.com/bdfinst/cutlist) (MIT)
et adapté au **système métrique** (mm + €/m²).

## Architecture

- `index.html` — UI React (faces Atelier / Client + modales Réglages, Mes
  devis, Calepinage).
- `index.html` — chaque devis porte un `id` stable (jamais édité) qui sert de
  clé à « Mes devis ». C'est l'identité du devis, **pas** son `numero` (champ
  métier libre, qui part du même défaut pour chaque nouveau devis).
- `lib/etabli-core.js` — **noyau de calcul sans DOM**, partagé par l'UI
  (`window.EtabliCore`) et les tests (`module.exports`) : `num`, `computeLine`,
  `tvaBreakdown`, `calculateCutlist`, `panelMetrics`, `cutListText`. Source
  unique de vérité pour la logique métier (`tvaBreakdown` ventile la TVA par
  taux : remise au prorata, déplacement à son taux). Le **stockage des devis**
  y vit aussi : `newQuoteId` (identité stable), `upsertQuote`/`removeQuote`
  (insertion/suppression sans perdre les autres devis — dédoublonnage par `id`,
  retombée sur `numero` pour les devis hérités) et `nextQuoteNumero`
  (numéro "DEV-<année>-NNN" auto-incrémenté). Le **catalogue de fournitures**
  y est pur aussi : `catalogItemFromLine`, `upsertCatalogItem`/`removeCatalogItem`
  (dédoublonnage par désignation normalisée), `searchCatalog` (auto-complétion :
  sous-chaîne, préfixe d'abord), `applyCatalogItemToLine` et `mergeCatalog`. La
  **sauvegarde/restauration** est pure aussi : `buildBackup` (emballe réglages +
  devis + calepinage + catalogue), `readBackup` (relit/valide un fichier, refuse
  les fichiers étrangers) et `mergeQuotes`/`mergeCatalog` (fusion sans perte).
  L'UI ne garde que le glue navigateur : téléchargement (Blob) et lecture de
  fichier (FileReader).

## Tests

```bash
npm install                       # playwright (dev only)
npx playwright install chromium   # navigateur pour les tests UI
npm run test:unit                 # logique pure (hors-ligne, rapide)
npm run test:ui                   # tests navigateur (Playwright)
npm test                          # tout
```

- `test/core.test.js` — tests unitaires de `lib/etabli-core.js` (marge,
  **ventilation TVA** : taux unique, taux mixtes 6 %/21 %, remise au prorata,
  déplacement, cocontractant, devis vide ; calepinage : panneaux entiers, trait
  de scie, rotation/sens du fil, pièces trop grandes, coût €/m², liste de débit,
  **chiffrage multi-matériaux** ; **stockage des devis** : deux devis au même
  numéro sont tous deux conservés, mise à jour sur place par `id`, suppression
  par `id`, rétro-compat sans `id`, numéro auto-incrémenté ; **catalogue** :
  extraction depuis une ligne, dédoublonnage par désignation, recherche
  préfixe-d'abord, remplissage d'une ligne, fusion sans perte ; **sauvegarde** :
  aller-retour `buildBackup`/`readBackup` (catalogue inclus), refus d'un fichier
  étranger, fusion `mergeQuotes`/`mergeCatalog` sans perte).
- `test/ui.test.js` — tests UI : non-régression de l'input « % marge » (le champ
  garde la valeur tapée), **TVA fournitures distincte → ventilation 6 %/21 %**,
  **override de TVA sur une seule fourniture** (l'autre suit le défaut),
  **enregistrer deux devis les garde tous les deux** (régression « seul le
  dernier devis était enregistré »), **exporter puis restaurer récupère un devis
  supprimé** (sauvegarde .json → suppression → restauration), **catalogue**
  (mémoriser ☆ → insérer → auto-complétion) et **catalogue inclus dans la
  sauvegarde**, parcours complet du calepinage, et **deux matériaux distincts →
  deux lignes de devis** (« Ajouter tout au devis »). Les tests partagent un
  contexte, donc chaque page repart d'un `localStorage` vide (isolation).

Les tests UI chargent React/Babel depuis un CDN → connexion réseau requise
(et `ignoreHTTPSErrors` pour les bacs à sable qui interceptent le TLS). La
logique pure est, elle, testée hors-ligne. Deux crochets de test facultatifs :
`PW_EXECUTABLE_PATH` (pointer un Chromium pré-installé si la version diffère du
Playwright épinglé) et `PW_VENDOR_DIR` (dossier avec `react.js`/`react-dom.js`/
`babel.js` pour servir les scripts CDN depuis le disque et tourner hors-ligne).
