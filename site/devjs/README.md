# ÉTABLI — devis menuisier (+ calepinage + bibliothèque de réemploi)

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

## Bibliothèque de références (réemploi) + base de données git

Bouton **« Bibliothèque »** dans la barre du haut. C'est un **catalogue
réutilisable** des **matières** (types de panneaux : cote, prix €/m², trait de
scie, sens du fil) et des **pièces** (désignation, longueur × largeur, quantité)
— pour ne plus les ressaisir d'un devis à l'autre.

- **Enregistrer** : depuis le calepinage, « ★ Enregistrer la matière » garde la
  matière active ; « ★ Enregistrer ces pièces » garde la liste de pièces du
  matériau actif. L'**id d'une référence est déterministe** (dérivé de son
  contenu) : ré-enregistrer la même matière ne crée pas de doublon, et deux
  postes qui enregistrent la même matière obtiennent le même id (→ fusion sans
  doublon).
- **Réinsérer** : le sélecteur « Insérer une matière… / une pièce… » (dans le
  calepinage **et** dans la modale Bibliothèque) instancie la référence avec un
  id frais. Insérer une pièce l'ajoute au matériau actif ; insérer une matière
  crée un nouvel onglet matière.

### La branche git dédiée comme base de données

La bibliothèque vit en `localStorage` **et** se pousse vers un **fichier JSON sur
une branche git dédiée** (`etabli-db` par défaut, `etabli/refs.json`) via l'**API
Contents de GitHub** — le « push depuis le site statique » demandé, **sans
serveur**.

- **Pousser** (`push`) : crée la branche au premier envoi (depuis la branche par
  défaut du dépôt), **relit la base distante, fusionne** (union par id, le
  `updatedAt` le plus récent gagne), puis écrit — donc deux postes ne s'écrasent
  pas. **Tirer** (`pull`) fusionne le distant dans le local.
- **Branche séparée de `main`** → aucun rebuild du site Pages, et l'historique
  des références reste hors du fil principal.
- **Authentification** : un **token GitHub « fine-grained »** limité à ce dépôt,
  permission **Contents : lecture et écriture**, saisi dans la modale. Il reste
  **dans le navigateur** (`localStorage`, clé `etabli:gh`).
  ⚠️ Le site est `noindex`, mais un PAT en `localStorage` reste sensible :
  **ne pas l'utiliser sur un poste partagé**, préférer un token à courte durée et
  au périmètre minimal, le révoquer au besoin. Pour aller en ligne sur
  `…/cad-mcp/devjs/`, le workflow Pages doit servir la branche/chemin courants
  (ici via `site/`).

## Architecture

- `index.html` — UI React (faces Atelier / Client + modales Réglages, Mes
  devis, Calepinage, **Bibliothèque**). Composants ajoutés : `RefSelect` (menu
  « insérer une référence »), `Bibliotheque` (catalogue + synchro git).
- `lib/etabli-core.js` — **noyau de calcul sans DOM**, partagé par l'UI
  (`window.EtabliCore`) et les tests (`module.exports`) : `num`, `computeLine`,
  `tvaBreakdown`, `calculateCutlist`, `panelMetrics`, `cutListText`. Source
  unique de vérité pour la logique métier (`tvaBreakdown` ventile la TVA par
  taux : remise au prorata, déplacement à son taux). **+ bibliothèque** :
  `emptyRefsDB`, `makeMaterialRef`/`makePieceRef` (extraction + id déterministe),
  `upsertRef`/`removeRef`, `mergeRefLists`/`mergeRefsDB`, `validateRefsDB`.
- `lib/gh-sync.js` — **client API Contents de GitHub** (`window.EtabliGhSync`,
  `module.exports`) : `getDB`, `ensureBranch`, `putDB`, `push`, `pull`. `fetch`
  et l'encodage base64 sont **injectables** → mêmes fonctions dans le navigateur
  et sous Node (tests). Aucun secret en dur.

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
  **chiffrage multi-matériaux** ; **bibliothèque** : extraction + id
  déterministe, upsert/remove, **fusion** newest-wins, validation).
- `test/gh-sync.test.js` — `lib/gh-sync.js` avec un `fetch` simulé (hors-ligne) :
  décodage base64 du JSON, fichier absent → `404`, **création de la branche**
  dédiée depuis la branche par défaut, `PUT` (base64 + `sha` + `branch`),
  remontée des erreurs GitHub, **`push` = fusion distant+local puis écriture**.
- `test/ui.test.js` — tests UI : non-régression de l'input « % marge » (le champ
  garde la valeur tapée), **TVA fournitures distincte → ventilation 6 %/21 %**,
  **override de TVA sur une seule fourniture** (l'autre suit le défaut), parcours
  complet du calepinage, et **deux matériaux distincts → deux lignes de devis**
  (« Ajouter tout au devis »).

Les tests UI chargent React/Babel depuis un CDN → connexion réseau requise
(et `ignoreHTTPSErrors` pour les bacs à sable qui interceptent le TLS). La
logique pure est, elle, testée hors-ligne.
