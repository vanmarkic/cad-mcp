# ÉTABLI — devis menuisier (+ calepinage)

Application d'une seule page (`index.html`, React via CDN, sans build) pour
générer des devis de menuiserie. Deux faces : **Atelier** (coûts, marge, métré —
back-office) et **Devis client** (imprimable, sans coût ni marge).

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
- `lib/etabli-core.js` — **noyau de calcul sans DOM**, partagé par l'UI
  (`window.EtabliCore`) et les tests (`module.exports`) : `num`, `computeLine`,
  `calculateCutlist`, `panelMetrics`, `cutListText`. Source unique de vérité
  pour la logique métier.

## Tests

```bash
npm install                       # playwright (dev only)
npx playwright install chromium   # navigateur pour les tests UI
npm run test:unit                 # logique pure (hors-ligne, rapide)
npm run test:ui                   # tests navigateur (Playwright)
npm test                          # tout
```

- `test/core.test.js` — tests unitaires de `lib/etabli-core.js` (marge,
  calepinage : panneaux entiers, trait de scie, rotation/sens du fil, pièces
  trop grandes, coût €/m², liste de débit, **chiffrage multi-matériaux**).
- `test/ui.test.js` — tests UI : non-régression de l'input « % marge » (le champ
  garde la valeur tapée), parcours complet du calepinage, et **deux matériaux
  distincts → deux lignes de devis** (« Ajouter tout au devis »).

Les tests UI chargent React/Babel depuis un CDN → connexion réseau requise
(et `ignoreHTTPSErrors` pour les bacs à sable qui interceptent le TLS). La
logique pure est, elle, testée hors-ligne.
