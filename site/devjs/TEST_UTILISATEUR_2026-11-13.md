# Test utilisateur synthétique — fiches clients + installation (2026-11-13)

Méthode : skill `test-user` (dépôt Wazza). 2 testeurs fictifs (agents ne voyant que des captures d'écran,
pilote Playwright, données d'essai fictives, téléphone 390–412 px), 6 missions chacun, 8 gestes max.
**Limite : un modèle qui joue une personne, pas une personne. Ne remplace pas un essai avec un vrai menuisier.**

| Testeur | Appareil | Connaissance | Missions réussies |
|---|---|---|---|
| « Marc », 52 ans | Android / Chrome | utilise ÉTABLI depuis 1 mois, ignore les nouveautés | 5/6 (échec = artefact du pilote : pas de geste « effacer ») |
| « Sofia », 34 ans | iPhone / Safari | première utilisation | 6/6, dont 2 avec doute (données après installation ; devis d'un client supprimé) |

## Ce qui marche
- Suggestion dans « Client » qui pré-remplit tout : trouvée sans aide par les deux (« exactement ce que je voulais »).
- Retrouver un numéro / une adresse : 1 geste. « + Nouveau client », « Modifier », confirmation de suppression : clairs.
- Bandeau d'installation + consignes Android / iPhone : trouvés en 1 geste.

## Corrigé suite au test
| Constat | Type | Correction |
|---|---|---|
| Devis vierge à l'ouverture numéroté « 001 » alors que des devis existent (antérieur à cette version) | Incohérence | numéro suivant + réglages enregistrés au chargement |
| Réglages au téléphone : le fond s'arrête à la hauteur de l'écran, texte illisible en défilant (antérieur) | Bug d'affichage | fenêtre en bloc, fond = contenu |
| « Mes devis » hors écran au téléphone (« où sont mes devis ? ») | Mal placé | « Mes devis » et « Nouveau » en tête de barre |
| Devis d'un client : seulement n° + date | Friction | + intitulé des travaux |
| Numéro / e-mail non touchables | Friction | liens `tel:` / `mailto:` |
| iPhone : « Vos devis restent dans ce navigateur » puis « stockage séparé » | Incompréhension | message franc : « l'application installée démarre VIDE » + étapes |

## À décider
- Ouvrir un devis depuis la fiche client remplace l'écran sans question s'il n'y a pas de modification (aucune perte possible, mais crainte exprimée).
- « Calepinage », « Atelier / Devis client » : non compris par les deux testeurs (hors périmètre de ce test).
