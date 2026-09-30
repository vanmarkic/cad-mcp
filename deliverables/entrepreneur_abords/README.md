# Sidecar — Livrables entrepreneur (devis abords)

Réponse à **Antoine Viseur** (mail du 25/06/2026) : il n'a pas de lecteur DWG et les PDF
transmis n'avaient aucune cote. On lui fournit donc des **PDF lisibles**.

⚠️ **Documents de travail — ne pas utiliser pour acte.** Rien de nouveau n'est mesuré ici :
ce sont des *rendus* de fichiers existants. Les cotes bâtiment sont **indicatives, à confirmer**
par l'architecte et le géomètre.

| fichier | quoi |
|---|---|
| `6190_releve_topographique.pdf` | **Levé topographique du géomètre** (J. Albert / Immo-Géo, GEO 050929), rendu depuis `sources/6190_clean.dxf`. **p.1** = planche site complète : limites de propriété, points topo, voirie, filets d'eau, cours d'eau, carroyage de coordonnées, cartouche *« Frameries 1ère Div. Section B — 1/625 — PL/6190/JA — 31/12/2025 »*, superficie mesurée 8 ha 65 a 80 ca. **p.2** = zoom bâtiments + abords immédiats (points topo, filets d'eau, lignes de coupe Profil 1–7). C'est la base pour le devis des abords. |
| `260608_RDC_cotes_indicatives.pdf` | **Plan projet — rez-de-chaussée**, rendu depuis `sources/260608_FermeduTemple.dxf` (unités = cm). À l'échelle, avec **grille de mesure 5 m / 25 m**, **réglet graphique**, **flèche nord**, **emprise hors-tout ~91 × 82 m** (rectangle d'encombrement, trait rouge), et les labels/surfaces des lots. |

## Points d'attention (importants)

- **6190 = le relevé topographique.** Son titre « plan de division » est trompeur : le fichier
  contient bien un levé complet du terrain (972 points topo `TCPOINT`/`PointTopo` avec attribut
  `ALT`, stations, limites, profils altimétriques, niveaux `Nd` 96,3–101,6 m). On n'a donc **pas**
  besoin d'un nouveau levé. Ce PDF est notre **rendu de travail, non visé** → pour la version
  officielle, demander le PDF au géomètre.
- **Cotes bâtiment = INDICATIVES.** Relevées sur le plan **PROJET** de l'architecte. Le fichier
  `260608` ne contient **aucune cotation** (0 objet DIMENSION) et **pas de dessin séparé de
  l'étage +1** (les lots d'étage sont reportés sur le même tracé). Les cotes précises pièce par
  pièce, aux deux niveaux, relèvent de l'architecte.

## Méthode / validation

- Rendu : `ezdxf 1.4.4` + `matplotlib` (backend `drawing`).
- Topo p.1 : rendu du **paperspace** « Rez-de-chaussée » (viewport → modelspace). Les planches
  « Profil 1–7 » ne se rendent pas via paperspace (contenu sur calque masqué) → leurs traces de
  coupe apparaissent en p.2.
- Topo p.2 / cotes : fenêtrage du modelspace ; enveloppe orientée via
  `shapely.minimum_rotated_rectangle` (≈ 90,7 × 81,7 m).

## Régénérer

```bash
# depuis la racine du repo, venv du projet
./.venv/bin/python deliverables/entrepreneur_abords/render_6190_topo.py
./.venv/bin/python deliverables/entrepreneur_abords/render_260608_cotes_RDC.py
# (les scripts écrivent dans /tmp/poc ; copier les PDF ici)
```
