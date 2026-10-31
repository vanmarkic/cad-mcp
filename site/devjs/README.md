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

## Formatage du texte libre

Les champs libres — **détail / métré** de chaque ligne, **description du
chantier** et **conditions** (bas de devis) — ont une barre d'outils
**G · I · S · • · 1.** (gras, italique, souligné, liste à puces, liste
numérotée). On sélectionne un bout de texte puis on clique ; un 2ᵉ clic retire
la mise en forme. Sans sélection, la barre insère une paire de marques et place
le curseur au milieu. Raccourcis : **Ctrl/⌘+B**, **Ctrl/⌘+I**, **Ctrl/⌘+U**.
Dès qu'un texte contient du formatage, un **aperçu** s'affiche sous le champ, et
le **devis client** (écran et impression/PDF) rend le résultat.

Le texte reste du **texte brut** dans le stockage et les sauvegardes `.json` —
un balisage léger, qu'on peut aussi taper à la main :

| Saisie | Rendu |
|---|---|
| `**gras**` | **gras** |
| `*italique*` | *italique* |
| `__souligné__` | souligné |
| `***gras italique***` | gras + italique |
| `- puce` ou `• puce` en début de ligne | liste à puces |
| `1. étape` ou `1) étape` en début de ligne | liste numérotée |
| `\*` et `\_` | un `*` / `_` affiché tel quel |

Règle de « bord de mot » (comme WhatsApp/Markdown) : `3*4`, `2 * 3` ou
`réf_12_B` restent du texte ordinaire. Le rendu fabrique des éléments React —
**jamais de HTML injecté** : un `<script>` ou `<img onerror=…>` saisi s'affiche
comme du texte. Les anciens devis (texte simple) s'affichent à l'identique.

## Mètre linéaire (baguettes, profilés, plinthes…)

### Dans une ligne de fourniture

Sur une ligne *fourniture*, cocher **« Calculer au mètre linéaire »** : la
quantité n'est plus saisie, elle découle d'une liste de **longueurs × quantités**
(en m, cm ou mm au choix), majorée d'une **chute / majoration (%)**. L'unité
devient `ml` et **« Prix d'achat / ml »** est le prix au mètre ; la marge, la TVA
et le catalogue fonctionnent comme d'habitude. Exemple : 3 × 2,40 m + 2 × 1,20 m
avec 10 % de chute = 9,60 × 1,10 = **10,56 ml**. Le bouton **« → Détail au
métré »** écrit la liste en puces dans le champ métré (visible sur le devis si la
case est cochée). Décocher garde la quantité calculée comme valeur saisie.

### Dans le calepinage : barres / profilés

Bouton **« + Barre / profilé »** (à côté de « + Matière »). Un matériau *barre*
se débite **en long** : on saisit la **longueur de la barre** de stock (mm), son
**prix** — **€/ml** ou **€/barre** (l'autre est dérivé) —, le **trait de scie**,
puis les longueurs à couper (désignation, longueur, quantité). L'outil calcule :

- le **nombre de barres entières** à acheter (découpe 1D, First/Best-Fit
  Decreasing, trait de scie entre deux pièces — une pièce qui épuise la barre n'en
  consomme pas) ; une pièce plus longue qu'une barre est **signalée**, pas perdue ;
- la **chute** (%), les **mètres achetés / utilisés** et le **coût matière** ;
- un **schéma par barre** (SVG) et la **liste de débit** tabulée à copier ;
- **« Ajouter au devis »** : une ligne fourniture `N barres × prix/barre`.

**Facturation** au choix : *barres entières* (on achète la barre complète) ou
*mètres débités* (le fournisseur coupe à la demande : on ne paie que le ml
utilisé → ligne `X ml × prix/ml`). Panneaux et barres cohabitent dans un même
calepinage ; « Ajouter tout au devis » crée une ligne par matière.

## Exporter / importer UN seul devis (additif)

Dans **« Mes devis »** :

- **« Exporter »** (sur chaque ligne) télécharge ce devis en
  `etabli-devis-<numéro>-AAAA-MM-JJ.json` ; **« Exporter le devis en cours »**
  fait de même pour le brouillon en cours d'édition (même non enregistré, sans
  l'enregistrer).
- **« Importer un devis… »** relit un tel fichier et **ajoute** le devis à la liste.
  L'import est strictement additif : il n'écrase aucun devis existant et ne touche
  ni au devis en cours, ni aux réglages, ni au catalogue.

Comportement selon ce que la liste contient déjà :

| Cas | Résultat |
|---|---|
| Identifiant inconnu | ajouté en tête de liste |
| Même identifiant **et** même contenu | « déjà dans Mes devis » — rien n'est ajouté (réimporter deux fois le même fichier ne crée pas de doublon) |
| Même identifiant, contenu **différent** (ex. le devis a été modifié depuis l'export) | ajouté comme **copie**, sous un nouvel identifiant ; l'existant reste tel quel |
| Un autre devis porte déjà le même **numéro** (cas courant entre deux postes) | ajouté, avec un avertissement ; le numéro n'est jamais modifié |

Un fichier illisible, d'une autre application, abîmé (lignes manquantes ou de type
inconnu) ou une **sauvegarde complète** est refusé avec un message clair, sans rien
changer — on n'ajoute pas cinquante devis par erreur : pour tout transférer, utiliser
la sauvegarde complète ci-dessus. Le fichier d'un devis reprend la même enveloppe que
la sauvegarde complète (avec `kind: "quote"`), donc *Réglages → Restaurer…* sait aussi
le relire, mais par **fusion** (un devis de même identifiant y est alors mis à jour).

### Faire remplir un devis par une IA (ChatGPT, Claude…)

Chaque fichier exporté **s'ouvre sur un en-tête destiné à l'IA**, avant les données :

```json
{
  "_instructions": [ "CONSIGNES POUR L'IA …", "FORMAT DE SORTIE …", "RÈGLES MÉTIER …", … ],
  "_schema": { "$schema": "https://json-schema.org/draft/2020-12/schema", … },
  "app": "etabli", "kind": "quote", "version": 1, "exportedAt": "…",
  "data": { "quotes": [ { …le devis… } ] }
}
```

- `_instructions` : consignes en clair — sortie = un seul objet JSON valide ; ne jamais
  calculer de totaux ni **inventer un prix ou une quantité** (laisser `""` ou poser la
  question) ; format des nombres (chaînes sans symbole ni unité), TVA, lignes, mètre
  linéaire, texte mis en forme, identifiants ; que faire si l'import échoue.
- `_schema` : JSON Schema (2020-12) du fichier — types, valeurs autorisées, champs
  obligatoires et, surtout, une `description` par champ. Les deux clés sont **ignorées
  à l'import**, et l'IA peut les omettre dans sa réponse.

**Mode d'emploi :** joindre le fichier exporté à la conversation, décrire le devis voulu
(ou « modifie ce devis : … »), enregistrer la réponse de l'IA en `.json` ou `.txt`, puis
*Mes devis → Importer un devis…*. Pour partir de zéro : *Nouveau*, puis *Exporter le devis
en cours* — le modèle vide emporte les mêmes consignes.

**Contrôle à l'import** (le même schéma sert de validateur, sans dépendance) :

- *Lecteur tolérant sur la syntaxe* : JSON lu en strict d'abord ; sinon on retire le bloc
  ```` ```json ````, le texte autour et les virgules finales, et on le signale (« JSON nettoyé
  automatiquement »). Réponse tronquée ou sans objet → erreur explicite.
- *Strict sur le fond* : un champ obligatoire manquant, une valeur hors liste (`tvaRate`
  = `"6 %"`), un nombre avec symbole (`"12 €"`), une date mal formée… sont **refusés**, et
  **toutes** les erreurs sont listées d'un coup, avec leur chemin
  (`data.quotes[0].lines[2].pa : format invalide …`). Rien n'est deviné ni converti, aucune
  valeur n'est inventée.
- *Champs inconnus* : non bloquants, signalés dans une remarque et conservés tels quels.
- Le cadre d'erreur reste affiché et son bouton **« Copier pour l'IA »** copie un message
  prêt à coller (« le fichier a été refusé, voici les erreurs, corrige uniquement ces
  points et renvoie le fichier complet ») : on boucle jusqu'à ce que l'import passe.

**Limites** — le schéma garantit la *structure*, pas la justesse : l'IA peut produire un
devis valide mais faux (mauvais prix, mauvaise quantité). Relire le devis importé, et
surtout les montants, avant de l'envoyer. Les nombres sont acceptés en chaîne ou en nombre
JSON. En conversation de chat, la génération contrainte par schéma des API (« structured
outputs ») n'existe pas : seules comptent les consignes, le schéma et ce contrôle à l'import.

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
  fichier (FileReader). L'**export/import d'un seul devis** y est pur aussi :
  `buildQuoteExport` (en-tête consignes IA + schéma), `readQuoteExport` /
  `readQuoteExportDetailed` (lecteur tolérant `parseJSONLenient`, validateur léger
  `validateQuoteFile` piloté par le schéma embarqué, refus d'une sauvegarde complète),
  `quoteFeedbackPrompt`, `quoteFileName` et `addImportedQuote` (ajout sans écrasement :
  ajouté / déjà présent / copie, avertissement de numéro). Le **mètre linéaire** y vit aussi : `linearTotal` /
  `linearLineQty` / `linearDetailText` (lignes de fourniture, utilisés par
  `computeLine`), `calculateLinearCutlist` (découpe 1D), `linearMetrics` (coût au
  ml ou à la barre, barres entières ou ml débités) et `linearCutListText`. Le
  **texte enrichi** aussi : `parseRichText` / `hasRichFormatting` (balisage → blocs
  et segments, rendus ensuite par le composant `RichText`) et `applyTextFormat`
  (logique de la barre d'outils : bascule gras/italique/souligné/listes, sélection
  restituée). Un matériau de calepinage porte un `kind` (`"panel"` par défaut,
  `"linear"` pour une barre) ; une ligne de fourniture, `mlOn` / `mlItems` /
  `mlUnit` / `mlPerte` — tous absents des données antérieures, qui restent valides.

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
  étranger, fusion `mergeQuotes`/`mergeCatalog` sans perte ; **devis seul** :
  aller-retour export/lecture, refus (JSON cassé, autre appli, sauvegarde complète,
  0 ou 2 devis, lignes illisibles), réparation (client, ids), nom de fichier, ajout
  additif (nouvel id, doublon identique ignoré, copie si contenu différent,
  numéro déjà utilisé) ; **export pour l'IA** : en-tête en premier dans le fichier,
  export valide contre son propre schéma, toutes les erreurs d'un coup avec chemin, nombres
  (chaîne/nombre acceptés, « 12 € » refusé), champs inconnus signalés sans bloquer, lecteur
  tolérant (bloc de code, prose autour, virgules finales hors chaînes, réponse tronquée),
  message de retour à l'IA, et garde-fous de dérive (champs cités dans les consignes
  présents dans le schéma ; schéma limité aux mots-clés du validateur, description partout) ; **texte enrichi** :
  gras/italique/souligné/combinaisons, mots non balisés (`3*4`, `réf_12_B`),
  échappements, listes, HTML laissé en texte, entrées dégénérées, barre d'outils
  (bascule, sélection restituée, marques imbriquées, multi-lignes, listes) avec un
  test d'aller-retour déterministe ; **mètre linéaire** : somme m/cm/mm, chute,
  `computeLine` en mode ml (et inchangé sans), détail de métré, découpe 1D (une
  pièce par barre, trait de scie, ajustement exact, pièce trop longue, bornes),
  coût au ml / à la barre / au ml débité).
- `test/ui.test.js` — tests UI : non-régression de l'input « % marge » (le champ
  garde la valeur tapée), **TVA fournitures distincte → ventilation 6 %/21 %**,
  **override de TVA sur une seule fourniture** (l'autre suit le défaut),
  **enregistrer deux devis les garde tous les deux** (régression « seul le
  dernier devis était enregistré »), **exporter puis restaurer récupère un devis
  supprimé** (sauvegarde .json → suppression → restauration), **catalogue**
  (mémoriser ☆ → insérer → auto-complétion) et **catalogue inclus dans la
  sauvegarde**, parcours complet du calepinage, et **deux matériaux distincts →
  deux lignes de devis** (« Ajouter tout au devis »), **formatage** (barre
  d'outils, raccourci Ctrl+B, rendu chez le client, HTML non interprété),
  **devis seul** (exporter depuis « Mes devis » puis réimporter, import additif :
  doublon ignoré / copie / numéro déjà utilisé, brouillon exporté sans être
  enregistré, devis en cours intact, fichiers refusés, devis importé recalculé à
  l'identique), **export IA** (en-tête consignes + schéma en tête du fichier, réponse d'IA
  collée avec bloc de code/virgule finale acceptée en `.txt`, JSON invalide → erreurs
  listées + « Copier pour l'IA » + fichier corrigé accepté, devis complet produit par
  l'appli — 4 types de lignes, mètre linéaire, calepinage — valide contre le schéma et
  réimporté à l'identique), **fourniture au mètre linéaire** (longueurs → ml → prix → feuille client,
  conversion cm/mm), **calepinage de barres** (nombre de barres, coût, schémas,
  facturation au ml débité, pièce trop longue, panneau + barre ensemble) et
  **compatibilité** (calepinage et devis antérieurs, sans les nouveaux champs, se
  chargent sans erreur). Les tests partagent un contexte, donc chaque page repart
  d'un `localStorage` vide (isolation).

Les tests UI chargent React/Babel depuis un CDN → connexion réseau requise
(et `ignoreHTTPSErrors` pour les bacs à sable qui interceptent le TLS). La
logique pure est, elle, testée hors-ligne. Deux crochets de test facultatifs :
`PW_EXECUTABLE_PATH` (pointer un Chromium pré-installé si la version diffère du
Playwright épinglé) et `PW_VENDOR_DIR` (dossier avec `react.js`/`react-dom.js`/
`babel.js` pour servir les scripts CDN depuis le disque et tourner hors-ligne).
