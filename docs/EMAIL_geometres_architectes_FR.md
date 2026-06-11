# E-mail aux géomètres et architectes (ton client / non-spécialiste)

**Objet :** Ferme du Temple — quelques observations et questions de ma part sur les surfaces des lots

---

Bonjour Monsieur Albert, bonjour Jordy,

Je me permets de revenir vers vous en tant que client, et je précise d'emblée que je ne suis pas
du métier. Par curiosité, et surtout pour mieux comprendre le projet, j'ai essayé de comparer entre
eux les différents documents que j'ai en main — le plan architecte `260608`, le plan de division
6190 (Immo-Géo), le scan 3D NavVis (ImmoPass) et la présentation PDF `260512`. Cela a fait surgir
quelques observations, et surtout des **questions**, que je souhaitais partager avec vous. Je m'en
remets bien entendu entièrement à votre expertise, et je vous prie de pardonner par avance mes
éventuelles maladresses ou erreurs.

Pour que vous puissiez suivre — et surtout corriger — mon raisonnement, je me permets d'abord de
vous décrire, le plus simplement possible, comment je m'y suis pris. Je vous laisse évidemment
seuls juges de la validité de tout cela.

**Comment j'ai procédé, étape par étape :**

1. **J'ai d'abord rassemblé les quatre documents.** J'ai réuni le plan architecte `260608`, votre
   plan de division 6190 (Immo-Géo), le scan 3D NavVis réalisé par ImmoPass, et la présentation
   PDF `260512`. Mon idée était simplement de les regarder côte à côte, plutôt que chacun de son côté.

2. **J'ai essayé de tout replacer dans le même repère.** Pour pouvoir superposer les plans, il fallait
   qu'ils « parlent les mêmes coordonnées ». Je me suis appuyé sur les coordonnées Lambert belge 2008
   (le système officiel utilisé pour situer un point en Belgique). Si je ne me trompe pas, le plan 6190
   et le scan NavVis se superposent exactement à un décalage constant de 500 000 m près — autrement dit
   un simple glissement, sans déformation. Cela m'a permis de caler tous les documents les uns sur les
   autres et de comparer des choses comparables.

3. **J'ai lu les surfaces du `260608` de deux manières indépendantes.** D'abord les **étiquettes de
   texte** (les chiffres notés sur le plan), puis la **géométrie réellement dessinée** : les surfaces
   nettes hachurées du calque « 0 » et le tracé des murs du calque « _Nieuw ». J'ai trouvé rassurant
   que les deux concordent à moins d'1 m² : cela me laisse penser que les surfaces inscrites sur le
   plan sont au moins cohérentes avec ce qui y est dessiné.

4. **J'ai comparé chaque lot entre les quatre sources**, dans une sorte de tableau de recoupement.
   C'est là que j'ai vu apparaître les écarts sur **L7, L8 et L9** entre le `260608` et le PDF. À mes
   yeux d'amateur, ces écarts ressemblent davantage à une **évolution du projet** (le lot a été agrandi
   ou réduit en cours de route) qu'à de véritables erreurs — mais c'est précisément le genre de chose
   que je vous laisse confirmer.

5. **J'ai vérifié les totaux par aile et par niveau** à l'aide du 6190 et du scan, pour voir si la somme
   des lots « tenait » dans l'enveloppe mesurée du bâtiment. L'**aile Sud-Est à l'étage** me paraît
   cohérente. En revanche, pour l'**aile Ouest à l'étage**, je n'ai pas su trancher : le scan n'y couvre
   qu'environ 11 % de la surface, ce qui me semble trop partiel pour conclure quoi que ce soit.

6. **J'ai essayé de reconstituer les lots manquants ou incertains** — L7+1, L8+1, L10, L12, et surtout
   **L13, qui n'apparaît pas du tout sur le `260608`**. Pour cela je me suis servi du **plan PDF de
   l'étage**, qui a l'avantage d'être « vectoriel » (les traits y sont de vraies lignes mesurables, et
   non une simple image). J'ai mesuré les pièces dessinées, puis je les ai recalées sur les lots dont la
   surface est déjà connue, pour donner l'échelle. J'obtiens ainsi **62, 94, 79, 63 et 78 m²**, des
   valeurs que j'ai d'ailleurs pu relire directement sur les étiquettes du plan. Je tiens toutefois à
   être clair : ce ne sont que des valeurs de **conception** — ces cloisons ne sont pas encore bâties,
   et donc invisibles au scan. Elles restent donc à confirmer par vous.

7. **J'ai reporté mes corrections avec prudence, sans jamais toucher aux originaux.** Les valeurs qui me
   semblaient sûres, je les ai inscrites sur une **copie** du fichier (un calque dupliqué que j'ai appelé
   `Tekst-ruimtelabel-corrigé`). Les valeurs d'étage encore incertaines, je les ai mises à part sur un
   **calque rouge « à confirmer »**, justement pour qu'elles sautent aux yeux et ne soient pas prises
   pour argent comptant.

8. **J'ai enfin produit les plans corrigés**, dans deux fichiers séparés — le rez-de-chaussée (+0)
   et l'étage (+1). Pour que chaque surface tombe au bon endroit, je les ai reportées directement
   sur votre plan, à l'emplacement exact de chaque lot. J'y ajoute, à toutes fins utiles, un
   document reprenant les **façades et coupes** issues du scan 3D (relevé « as-built »), ainsi que
   mes notes de recoupement.

**Ce que j'ai cru remarquer (à confirmer par vos soins) :**

- Les surfaces des lots semblent cohérentes à l'intérieur du plan `260608`. En revanche, j'ai noté
  quelques écarts pour **L7, L8 et L9** entre ce plan et le PDF de présentation. Je suppose qu'il
  s'agit simplement d'une évolution du projet plutôt que d'une erreur — est-ce bien le cas ?
- Pour **L11**, les sources semblent concorder (~107 m²), ce qui me rassure.
- Pour **L10, L12 et L13** (ce dernier n'apparaissant pas du tout sur le `260608`), je n'ai trouvé
  aucune surface mesurée. Je les ai donc **reconstituées à partir du plan PDF de l'étage** —
  **L10 ≈ 79 m², L12 ≈ 63 m², L13 ≈ 78 m²** — et reportées dans leur pièce respective. Ce ne sont
  toutefois que des valeurs de **conception** ; pourriez-vous me les confirmer, ou m'indiquer quel
  plan fait foi ?
- En regardant le scan, l'aile Sud-Est à l'étage me paraît cohérente ; pour l'aile Ouest à l'étage
  je suis beaucoup moins sûr (le scan y est très partiel) — je préfère vous laisser juges.

**Ce qui m'aiderait beaucoup :**

- Disposez-vous d'un **plan / DWG de conception plus récent** que le PDF ? Cela lèverait mes doutes
  sur L7 et L8 à l'étage, ainsi que sur L10, L12 et L13.
- Les étiquettes qui portent deux numéros (**L2/L10, L4/L11, L9/L12**) m'ont un peu perdu — faut-il
  les séparer, et si oui comment ?
- Pour **L5 et L6**, j'ai vu des **terrasses** (44 et 42 m²) comptées à part : est-ce bien voulu
  pour les surfaces officielles ?

Pour ne rien risquer, je n'ai touché à aucun original : j'ai seulement reporté mes essais de
correction sur **une copie** des fichiers, que je joins au cas où cela vous serait utile — mais vous
restez évidemment les seuls juges de ce qui est correct.

**Documents joints :**
- les deux plans corrigés, en fichiers séparés : `plan_corrige_RDC.pdf` (RDC +0) et
  `plan_corrige_etage.pdf` (étage +1) — surfaces reportées à l'emplacement exact de chaque lot ;
- le fichier CAO corrigé `260608_FermeduTemple_FINAL.dxf` (une copie ; vos originaux restent intacts) ;
- les **façades et coupes** du relevé as-built (scan 3D) : `facades_coupes_aligned.pdf` ;
- deux notes de recoupement : `CORRECTION_PROPOSAL.md` et `CROSSCHECK_lots.md`.

Un grand merci pour votre travail et pour votre patience avec mes questions de néophyte. Je reste
bien sûr à votre disposition pour en discuter.

Bien cordialement,

[Votre nom]
