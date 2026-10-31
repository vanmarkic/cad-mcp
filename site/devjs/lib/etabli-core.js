/* =========================================================================
   ÉTABLI — noyau de calcul (partagé par index.html et la suite de tests).
   Pas de DOM, pas de React : des nombres en entrée / en sortie, pour tourner
   à l'identique dans le navigateur (window.EtabliCore) et dans Node
   (module.exports). Le calepinage raisonne sans unité — l'UI lui passe des mm.
   Calepinage porté depuis bdfinst/cutlist (MIT) vers du JS simple.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.EtabliCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- lecture d'un nombre ("1 234,5" → 1234.5) ---------- */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var f = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    return isFinite(f) ? f : 0;
  }

  /* ---------- calcul d'une ligne de devis ---------- */
  function computeLine(l) {
    if (l.type === "main") {
      var coutM = num(l.heures) * num(l.coutHoraire);
      var venteM = num(l.heures) * num(l.tauxVente);
      return { cout: coutM, vente: venteM, puv: num(l.tauxVente), qte: num(l.heures), unite: "h" };
    }
    if (l.type === "forfait") {
      var coutF = num(l.pa);
      var venteF = num(l.pa) * (1 + num(l.marge) / 100);
      return { cout: coutF, vente: venteF, puv: venteF, qte: 1, unite: "forfait" };
    }
    // fourniture — « au mètre linéaire » (mlOn) : la quantité n'est pas saisie,
    // elle découle de la liste des longueurs (+ chute) et l'unité est le ml ;
    // `pa` est alors le prix d'achat AU MÈTRE.
    var isMl = !!l.mlOn;
    var qte = isMl ? linearLineQty(l).qteM : num(l.qte);
    var puv = num(l.pa) * (1 + num(l.marge) / 100);
    var vente = puv * qte;
    var cout = num(l.pa) * qte;
    return { cout: cout, vente: vente, puv: puv, qte: qte, unite: isMl ? "ml" : (l.unite || "u") };
  }

  /* ---------- ventilation de la TVA par taux ----------
     Une facture belge à taux mixtes (p. ex. 6 % main-d'œuvre + 21 % fournitures)
     doit montrer la base ET la TVA par taux. Fonction pure, sans notion de
     « ligne » : l'appelant a déjà résolu le taux effectif de chaque poste.
       rows : [{ vente:Number, rate:Number }]  (rate = taux % du poste ; 0 = exonéré)
       opts : { remise:Number=0, deplacement:Number=0, deplacementRate:Number=0 }
         - remise (€) répartie au prorata du HT de chaque poste ;
         - deplacement (€) ajouté au taux deplacementRate.
     Retour : { venteHT, baseHT, tva, ttc, groups:[{ rate, base, tva }] } —
     groups trié par taux décroissant, base/tva déjà cumulées par taux. */
  function tvaBreakdown(rows, opts) {
    opts = opts || {};
    rows = rows || [];
    var remise = num(opts.remise);
    var deplacement = num(opts.deplacement);
    var deplacementRate = num(opts.deplacementRate);

    var venteHT = 0, i;
    for (i = 0; i < rows.length; i++) venteHT += num(rows[i].vente);

    // la remise rogne chaque poste au prorata (jamais en-dessous de 0)
    var afterRemise = venteHT - remise;
    if (afterRemise < 0) afterRemise = 0;
    var factor = venteHT > 0 ? afterRemise / venteHT : 0;

    var bases = {};
    function addBase(rate, amount) {
      var key = String(rate);
      if (!bases.hasOwnProperty(key)) bases[key] = 0;
      bases[key] += amount;
    }
    for (i = 0; i < rows.length; i++) {
      addBase(num(rows[i].rate), num(rows[i].vente) * factor);
    }
    if (deplacement !== 0) addBase(deplacementRate, deplacement);

    var rates = Object.keys(bases).map(Number).sort(function (a, b) { return b - a; });
    var groups = [], baseHT = 0, tva = 0;
    for (i = 0; i < rates.length; i++) {
      var rt = rates[i];
      var base = bases[String(rt)];
      var t = base * (rt / 100);
      baseHT += base;
      tva += t;
      groups.push({ rate: rt, base: base, tva: t });
    }
    return {
      venteHT: venteHT,
      remise: remise,
      deplacement: deplacement,
      baseHT: baseHT,
      tva: tva,
      ttc: baseHT + tva,
      groups: groups,
    };
  }

  /* =========================================================================
     STOCKAGE DES DEVIS (« Mes devis »).
     Régression corrigée : l'app dédoublonnait par `numero`, mais chaque nouveau
     devis part du même numéro par défaut ("DEV-YYYY-001"). Enregistrer un 2ᵉ
     devis écrasait donc le 1ᵉʳ — « il n'enregistre que le dernier devis ».
     L'identité stable d'un devis est son `id` (jamais édité), pas le `numero`
     (champ métier libre, sujet à collision). On retombe sur `numero` seulement
     pour les devis hérités, persistés avant l'existence des ids.
     ========================================================================= */

  // Identifiant unique et stable d'un devis (indépendant du numéro affiché).
  var _idSeq = 0;
  function newQuoteId() {
    _idSeq += 1;
    var rand = Math.floor(Math.random() * 1e9).toString(36);
    return "q_" + Date.now().toString(36) + "_" + _idSeq.toString(36) + rand;
  }

  // Clé d'identité : l'id s'il existe, sinon le numéro (rétro-compat).
  function quoteKey(q) {
    if (q && q.id != null && q.id !== "") return "id:" + q.id;
    return "num:" + (q ? q.numero : undefined);
  }

  // Insère ou met à jour un devis dans la liste, sans jamais perdre les autres.
  // Le devis (ré)enregistré passe en tête ; une mise à jour reste à sa place.
  function upsertQuote(list, quote) {
    list = Array.isArray(list) ? list.slice() : [];
    var key = quoteKey(quote);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (quoteKey(list[i]) === key) { idx = i; break; }
    }
    if (idx >= 0) {
      list[idx] = quote;
      return list;
    }
    return [quote].concat(list);
  }

  // Supprime un devis par son id (retombe sur le numéro pour les devis hérités).
  function removeQuote(list, id) {
    list = Array.isArray(list) ? list : [];
    return list.filter(function (q) {
      var qid = q && q.id != null && q.id !== "" ? q.id : q && q.numero;
      return qid !== id;
    });
  }

  // Prochain numéro libre "DEV-<année>-NNN" à partir du plus haut déjà utilisé.
  function nextQuoteNumero(list, year) {
    var prefix = "DEV-" + year + "-";
    var max = 0;
    list = Array.isArray(list) ? list : [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i] && list[i].numero;
      if (typeof n === "string" && n.indexOf(prefix) === 0) {
        var v = parseInt(n.slice(prefix.length), 10);
        if (isFinite(v) && v > max) max = v;
      }
    }
    var next = String(max + 1);
    while (next.length < 3) next = "0" + next;
    return prefix + next;
  }

  /* =========================================================================
     CATALOGUE DE FOURNITURES réutilisables.
     On encode une fourniture une fois (désignation, prix d'achat, unité, marge,
     TVA) puis on la retrouve par auto-complétion ou via la modale « Catalogue ».
     L'identité d'un article est sa désignation normalisée (pas de doublon
     "MDF 18mm" / "mdf  18MM"). Fonctions pures — l'UI ne fait que du câblage.
     ========================================================================= */
  var _catSeq = 0;
  function newCatalogItemId() {
    _catSeq += 1;
    var rand = Math.floor(Math.random() * 1e9).toString(36);
    return "c_" + Date.now().toString(36) + "_" + _catSeq.toString(36) + rand;
  }

  // Clé d'identité d'un article : désignation sans casse ni espaces superflus.
  function normDesignation(s) {
    return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
  }

  // Construit un article de catalogue à partir d'une ligne de devis (fourniture).
  // Ne garde que les champs réutilisables ; null si la désignation est vide.
  function catalogItemFromLine(line) {
    line = line || {};
    var desig = String(line.designation == null ? "" : line.designation).trim();
    if (!desig) return null;
    return {
      id: newCatalogItemId(),
      designation: desig,
      pa: line.pa != null ? line.pa : "",
      unite: line.unite || "u",
      marge: line.marge != null ? line.marge : "",
      tvaRate: line.tvaRate != null ? line.tvaRate : "",
    };
  }

  // Insère ou met à jour un article (dédoublonnage par désignation normalisée).
  // Un article sans désignation est ignoré. La mise à jour garde la position et
  // l'id existant ; le nouvel article passe en tête.
  function upsertCatalogItem(list, item) {
    list = Array.isArray(list) ? list.slice() : [];
    if (!item || !normDesignation(item.designation)) return list;
    var key = normDesignation(item.designation);
    for (var i = 0; i < list.length; i++) {
      if (normDesignation(list[i].designation) === key) {
        list[i] = { id: list[i].id, designation: item.designation, pa: item.pa, unite: item.unite, marge: item.marge, tvaRate: item.tvaRate };
        return list;
      }
    }
    return [item].concat(list);
  }

  function removeCatalogItem(list, id) {
    list = Array.isArray(list) ? list : [];
    return list.filter(function (it) { return it && it.id !== id; });
  }

  // Recherche pour l'auto-complétion : sous-chaîne insensible à la casse, les
  // correspondances par préfixe d'abord, limitée à `limit` résultats. Requête
  // vide → tout le catalogue (jusqu'à la limite).
  function searchCatalog(list, query, limit) {
    list = Array.isArray(list) ? list : [];
    var q = normDesignation(query);
    limit = limit == null ? 8 : limit;
    var matches = [];
    for (var i = 0; i < list.length; i++) {
      var pos = normDesignation(list[i].designation).indexOf(q);
      if (pos >= 0) matches.push({ it: list[i], pref: pos === 0 ? 0 : 1, ord: i });
    }
    matches.sort(function (a, b) { return a.pref - b.pref || a.ord - b.ord; });
    return matches.slice(0, limit).map(function (m) { return m.it; });
  }

  // Applique un article à une ligne : remplit les champs réutilisables, préserve
  // tout le reste (id, type, quantité, métré, cases à cocher…).
  function applyCatalogItemToLine(line, item) {
    var out = {};
    for (var k in line) if (Object.prototype.hasOwnProperty.call(line, k)) out[k] = line[k];
    out.designation = item.designation;
    out.pa = item.pa;
    out.unite = item.unite;
    out.marge = item.marge;
    out.tvaRate = item.tvaRate != null ? item.tvaRate : "";
    return out;
  }

  // Fusionne deux catalogues par désignation, sans perte (pour la restauration).
  function mergeCatalog(current, incoming) {
    var list = Array.isArray(current) ? current.slice() : [];
    incoming = Array.isArray(incoming) ? incoming : [];
    for (var i = incoming.length - 1; i >= 0; i--) list = upsertCatalogItem(list, incoming[i]);
    return list;
  }

  /* =========================================================================
     SAUVEGARDE / RESTAURATION de TOUTES les données utilisateur.
     Un seul fichier .json (réglages + devis + calepinage) qu'on télécharge pour
     mettre à l'abri, et qu'on réimporte sur un autre navigateur / poste. Ces
     fonctions sont pures : le téléchargement et la lecture de fichier (FileReader)
     restent côté UI.
     ========================================================================= */
  var BACKUP_APP = "etabli";
  var BACKUP_VERSION = 1;

  // Emballe les données (déjà désérialisées) dans un paquet de sauvegarde.
  // meta.exportedAt est fourni par l'appelant (le noyau ne lit pas l'horloge).
  function buildBackup(data, meta) {
    data = data || {};
    meta = meta || {};
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: meta.exportedAt != null ? meta.exportedAt : null,
      data: {
        settings: data.settings != null ? data.settings : null,
        quotes: Array.isArray(data.quotes) ? data.quotes : [],
        calepinage: data.calepinage != null ? data.calepinage : null,
        catalogue: Array.isArray(data.catalogue) ? data.catalogue : [],
      },
    };
  }

  // Lit et valide un paquet (chaîne JSON ou objet déjà parsé). Lève une erreur
  // explicite si ce n'est pas une sauvegarde Établi. Rend { settings, quotes,
  // calepinage } normalisés (sections absentes → null / []).
  function readBackup(input) {
    var obj;
    if (typeof input === "string") {
      try { obj = JSON.parse(input); }
      catch (e) { throw new Error("Fichier illisible (JSON invalide)."); }
    } else {
      obj = input;
    }
    if (!obj || typeof obj !== "object" || obj.app !== BACKUP_APP || !obj.data || typeof obj.data !== "object") {
      throw new Error("Ce fichier n'est pas une sauvegarde Établi.");
    }
    var d = obj.data;
    return {
      settings: d.settings != null ? d.settings : null,
      quotes: Array.isArray(d.quotes) ? d.quotes : [],
      calepinage: d.calepinage != null ? d.calepinage : null,
      catalogue: Array.isArray(d.catalogue) ? d.catalogue : [],
    };
  }

  // Fusionne deux listes de devis par identité (id, sinon numéro). Les devis
  // entrants priment sur les existants de même identité et rien n'est supprimé —
  // une restauration ne peut donc pas faire perdre les devis en cours.
  function mergeQuotes(current, incoming) {
    var list = Array.isArray(current) ? current.slice() : [];
    incoming = Array.isArray(incoming) ? incoming : [];
    // On applique en ordre inverse : upsertQuote empile en tête, l'ordre
    // d'origine de `incoming` se retrouve donc préservé au-dessus des existants.
    for (var i = incoming.length - 1; i >= 0; i--) {
      list = upsertQuote(list, incoming[i]);
    }
    return list;
  }

  /* =========================================================================
     EXPORT / IMPORT D'UN SEUL DEVIS — strictement ADDITIF.
     Un fichier .json = un devis. L'import AJOUTE le devis à « Mes devis » :
     il n'écrase jamais un devis existant et ne touche ni au devis en cours, ni
     aux réglages, ni au catalogue.
       - identifiant absent de la liste → ajouté tel quel ;
       - même identifiant ET même contenu → déjà là, rien n'est ajouté
         (réimporter deux fois le même fichier ne crée pas de doublon) ;
       - même identifiant mais contenu différent → ajouté comme COPIE, sous un
         nouvel identifiant (l'existant reste intact).
     Le fichier reprend l'enveloppe de la sauvegarde complète (`data.quotes`, ici
     à un seul élément) + `kind:"quote"` : « Réglages → Restaurer » sait donc le
     relire aussi (par fusion), alors que l'import d'un seul devis refuse une
     sauvegarde complète — on n'ajoute pas 50 devis par erreur.
     ========================================================================= */
  var QUOTE_FILE_KIND = "quote";
  var LINE_TYPES = ["fourniture", "main", "forfait"];

  function cloneJSON(v) { return JSON.parse(JSON.stringify(v)); }
  function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function strOf(v) { return v == null ? "" : String(v); }

  var _lineSeq = 0;
  function newLineId() {
    _lineSeq += 1;
    return "l_" + Date.now().toString(36) + "_" + _lineSeq.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* ---------- schéma + consignes pour l'IA, embarqués dans chaque export ----------
     Le fichier exporté s'ouvre sur `_instructions` (consignes en clair) puis
     `_schema` (JSON Schema 2020-12) : on peut le donner tel quel à ChatGPT, Claude
     ou toute autre IA, qui s'en sert pour modifier le devis ou en produire un
     autre. À l'import, ces deux clés sont ignorées ; le MÊME schéma sert de
     validateur léger (voir checkSchema) — une seule source de vérité.
     Le schéma reste volontairement simple (type, enum, const, pattern, required,
     properties, items, minItems/maxItems) : les `description` sont le vrai guide de
     l'IA, et elles resservent de message d'erreur. Elles ne vont PAS dans
     `$comment`, que la spec JSON Schema autorise les outils à supprimer. */
  var NUM_PATTERN = "^\\s*(-?\\d+([.,]\\d+)?)?\\s*$";
  function numStr(d) {
    return {
      type: ["string", "number"],
      pattern: NUM_PATTERN,
      description: d + ' Nombre en chaîne, sans symbole ni unité ("12,5"), "" = non renseigné.',
    };
  }
  function strField(d) { return { type: "string", description: d }; }
  var VAT_DESC = "6 (rénovation de logement de plus de 10 ans), 21 (standard / neuf) ou 12 (cas particuliers).";

  var QUOTE_JSON_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Export d'un devis ÉTABLI",
    description: "Fichier d'export / d'import d'UN devis de menuiserie. Ré-importable tel quel dans ÉTABLI (Mes devis → Importer un devis…).",
    type: "object",
    required: ["app", "kind", "data"],
    properties: {
      _instructions: { description: "Consignes pour l'IA. Ignoré à l'import : tu peux l'omettre dans ta réponse." },
      _schema: { description: "Le présent schéma. Ignoré à l'import : tu peux l'omettre dans ta réponse." },
      app: { const: "etabli", description: 'Toujours "etabli".' },
      kind: { const: "quote", description: 'Toujours "quote" (un seul devis par fichier).' },
      version: { type: "integer", description: "Version du format : 1." },
      exportedAt: { type: ["string", "null"], description: "Date d'export ISO 8601, ou null." },
      data: {
        type: "object",
        description: "Contenu du fichier : la liste `quotes` ne contient qu'UN devis.",
        required: ["quotes"],
        properties: {
          quotes: {
            type: "array",
            minItems: 1,
            maxItems: 1,
            description: "Exactement UN devis.",
            items: {
              type: "object",
              required: ["numero", "dateISO", "clientType", "tvaRate", "acompte", "validite", "lines"],
              properties: {
                id: strField("Identifiant unique et stable du devis (texte). Garde-le pour modifier CE devis ; mets-en un nouveau pour en créer un autre."),
                numero: strField('Numéro du devis affiché au client, ex. "DEV-2026-001".'),
                dateISO: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: 'Date du devis au format AAAA-MM-JJ, ex. "2026-10-31".' },
                client: {
                  type: "object",
                  description: "Coordonnées du client.",
                  properties: {
                    nom: strField("Nom ou société."),
                    adresse: strField("Adresse du chantier."),
                    email: strField("E-mail."),
                    tel: strField("Téléphone."),
                  },
                },
                chantier: strField("Description du chantier (texte mis en forme possible)."),
                clientType: { enum: ["particulier", "pro"], description: '"particulier" (TVA appliquée) ou "pro" (professionnel cocontractant : autoliquidation, TVA 0 %).' },
                tvaRate: { enum: [6, 12, 21], description: "Taux de TVA principal en % (NOMBRE, pas une chaîne) : " + VAT_DESC + " S'applique à la main-d'œuvre, aux forfaits et au déplacement." },
                tvaFournitures: { enum: ["", 6, 12, 21], description: 'Taux de TVA dédié aux lignes de fourniture (nombre), ou "" pour le même taux que tvaRate.' },
                remiseType: { enum: ["eur", "pct"], description: 'Unité de la remise : "eur" (€) ou "pct" (%).' },
                remiseVal: numStr("Valeur de la remise (en € ou en %, selon remiseType)."),
                deplacement: numStr("Frais de déplacement facturés au client, en € HTVA."),
                deplacementCout: numStr("Coût réel du déplacement pour l'atelier, en € (jamais montré au client)."),
                acompte: numStr("Acompte demandé à la commande, en % du total TVAC."),
                validite: numStr("Validité du devis, en jours."),
                conditions: strField("Conditions de bas de devis (texte mis en forme possible)."),
                lines: {
                  type: "array",
                  description: "Lignes du devis, dans l'ordre d'affichage.",
                  items: {
                    type: "object",
                    required: ["type"],
                    properties: {
                      id: strField('Identifiant unique de la ligne dans le devis, ex. "l1".'),
                      type: { enum: LINE_TYPES, description: '"fourniture" = matériel (qte × pa, plus marge) ; "main" = main-d\'œuvre (heures × tauxVente) ; "forfait" = montant global (pa, plus marge).' },
                      designation: strField("Libellé de la ligne, affiché au client."),
                      detail: strField("Métré / détail de la ligne (texte mis en forme possible) ; montré au client seulement si showDetail vaut true."),
                      showDetail: { type: "boolean", description: "Afficher le détail sur le devis client." },
                      showQty: { type: "boolean", description: "Afficher la quantité et le prix unitaire sur le devis client." },
                      qte: numStr("Quantité (fourniture ; ignorée si mlOn vaut true)."),
                      unite: strField('Unité de la fourniture : "u", "m²", "pce"… ; "ml" si mlOn vaut true.'),
                      pa: numStr("Prix d'achat HTVA : par unité (fourniture), par mètre si mlOn vaut true, ou montant du forfait."),
                      marge: numStr("Marge en % ajoutée au prix d'achat (30 → prix de vente = pa × 1,30). Fourniture et forfait."),
                      tvaRate: { enum: ["", 6, 12, 21], description: 'Taux de TVA propre à cette fourniture (nombre), ou "" pour le taux fournitures du devis.' },
                      heures: numStr("Nombre d'heures (main-d'œuvre)."),
                      tauxVente: numStr("Taux horaire facturé au client, en € HTVA (main-d'œuvre)."),
                      coutHoraire: numStr("Coût horaire interne, en € (main-d'œuvre, jamais montré au client)."),
                      mlOn: { type: "boolean", description: "Fourniture calculée au mètre linéaire : ÉTABLI calcule alors la quantité à partir de mlItems, mlUnit et mlPerte (qte est ignorée)." },
                      mlItems: {
                        type: "array",
                        description: "Longueurs à fournir (si mlOn vaut true), sinon [].",
                        items: {
                          type: "object",
                          properties: {
                            id: strField("Identifiant unique de la longueur."),
                            len: numStr("Longueur, exprimée dans l'unité mlUnit."),
                            qty: numStr("Nombre de pièces de cette longueur (entier)."),
                          },
                        },
                      },
                      mlUnit: { enum: ["m", "cm", "mm"], description: "Unité des longueurs de mlItems." },
                      mlPerte: numStr("Chute / majoration en %, appliquée à la somme des longueurs."),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  var QUOTE_AI_INSTRUCTIONS = [
    "CONSIGNES POUR L'IA (ChatGPT, Claude, ou toute autre IA).",
    "Ce fichier est l'export d'UN devis de menuiserie de l'application ÉTABLI (Belgique). Il se réimporte tel quel dans ÉTABLI : Mes devis → Importer un devis…",
    "TA TÂCHE : d'après la demande de l'utilisateur, tu modifies ce devis ou tu en crées un nouveau en prenant celui-ci comme modèle, puis tu renvoies le fichier COMPLET.",
    "FORMAT DE SORTIE : un SEUL objet JSON valide, dans un seul bloc de code ```json, sans aucun texte avant ni après. JSON strict : guillemets doubles, pas de virgule finale, pas de commentaire. Garde les clés app, kind, version et data telles quelles. Tu peux omettre _instructions et _schema (ignorés à l'import).",
    "SCHÉMA : respecte _schema (types, valeurs autorisées, champs obligatoires) et lis la description de chaque champ. N'invente aucun champ. Garde pour chaque ligne le même jeu de champs que dans le devis d'exemple ; ceux qui ne concernent pas son type restent vides.",
    'NOMBRES : montants, quantités et pourcentages sont des chaînes, comme dans l\'exemple, sans symbole ni unité ("12,5", jamais "12,5 €"). "" = non renseigné. Seuls tvaRate, tvaFournitures et tvaRate de ligne sont de vrais nombres JSON (6, 12 ou 21). Les dates s\'écrivent AAAA-MM-JJ.',
    "RÈGLES MÉTIER : (1) Ne calcule JAMAIS de totaux : ÉTABLI recalcule tout à partir des lignes, il n'existe aucun champ total. (2) N'invente AUCUN prix ni aucune quantité : si une valeur manque, laisse \"\" ou pose la question à l'utilisateur avant de répondre. (3) marge est un pourcentage ajouté au prix d'achat pa : marge 30 donne un prix de vente de pa × 1,30. (4) clientType \"pro\" = professionnel cocontractant : autoliquidation, TVA 0 %.",
    'LIGNES : type "fourniture" = matériel (qte × pa, plus marge) ; "main" = main-d\'œuvre (heures × tauxVente, coutHoraire = coût interne) ; "forfait" = montant global (pa, plus marge). Chaque ligne a un id unique dans le devis ("l1", "l2"…).',
    "MÈTRE LINÉAIRE (fournitures : baguettes, profilés…) : si mlOn vaut true, ÉTABLI calcule la quantité à partir de mlItems (liste de { id, len, qty }) exprimés dans mlUnit (\"m\", \"cm\" ou \"mm\"), majorés de mlPerte (% de chute) ; unite vaut alors \"ml\" et pa est le prix d'achat au mètre. Sinon mlOn vaut false et mlItems vaut [].",
    "TEXTE MIS EN FORME (detail, chantier, conditions) : **gras**, *italique*, __souligné__ ; « - » en début de ligne = puce ; « 1. » = liste numérotée ; retour à la ligne = \\n ; jamais de HTML.",
    "IDENTIFIANTS : pour modifier ce devis, garde son id et son numero. Pour un autre devis, mets un nouvel id (texte unique) et un nouveau numero. L'import AJOUTE toujours le devis à la liste sans écraser l'existant.",
    "SI L'IMPORT ÉCHOUE : ÉTABLI affiche la liste des erreurs avec leur chemin (ex. data.quotes[0].lines[2].type). L'utilisateur te la collera : corrige uniquement ces points et renvoie le fichier complet.",
  ];

  // Emballe UN devis. En-tête (consignes + schéma) d'abord, puis l'enveloppe et le
  // devis. `_savedAt` (horodatage local de « Enregistrer ») n'est pas exporté ; un
  // devis sans id reçoit un identifiant stable. meta.aiHeader === false → sans en-tête.
  function buildQuoteExport(quote, meta) {
    meta = meta || {};
    var q = cloneJSON(quote || {});
    delete q._savedAt;
    if (q.id == null || q.id === "") q.id = newQuoteId();
    var out = {};
    if (meta.aiHeader !== false) {
      out._instructions = QUOTE_AI_INSTRUCTIONS.slice();
      out._schema = cloneJSON(QUOTE_JSON_SCHEMA);
    }
    out.app = BACKUP_APP;
    out.kind = QUOTE_FILE_KIND;
    out.version = BACKUP_VERSION;
    out.exportedAt = meta.exportedAt != null ? meta.exportedAt : null;
    out.data = { quotes: [q] };
    return out;
  }

  // Nom de fichier : etabli-devis-<numéro>-<date>.json (numéro nettoyé : sans accents
  // ni caractères interdits dans un nom de fichier).
  function quoteFileName(quote, dateISO) {
    var n = strOf(quote && quote.numero).trim();
    if (n.normalize) n = n.normalize("NFD").replace(/[̀-ͯ]/g, "");
    n = n.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return "etabli-devis-" + (n || "sans-numero") + (dateISO ? "-" + dateISO : "") + ".json";
  }

  /* ---------- lecteur tolérant (syntaxe) ----------
     Une IA répond rarement en JSON « nu » : bloc ```json, phrase autour, virgule
     finale. On lit STRICT d'abord ; en cas d'échec seulement, on extrait le premier
     objet {…} équilibré (en respectant les chaînes), on retire les virgules finales
     et on relit. Le lecteur ne devine JAMAIS un champ manquant ni ne convertit un
     type : le fond est du ressort du schéma. */
  function stripTrailingCommas(s) {
    var out = "", inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (inStr) {
        out += c;
        if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === ",") {
        var j = i + 1;
        while (j < s.length && /\s/.test(s.charAt(j))) j++;
        if (s.charAt(j) === "}" || s.charAt(j) === "]") continue;
      }
      out += c;
    }
    return out;
  }

  function extractFirstObject(s) {
    var start = s.indexOf("{");
    if (start < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var i = start; i < s.length; i++) {
      var c = s.charAt(i);
      if (inStr) {
        if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return null; // objet jamais refermé (réponse tronquée ?)
  }

  // → { value, repaired } ; lève « Fichier illisible (JSON invalide)… » sinon.
  function parseJSONLenient(text) {
    var s = String(text == null ? "" : text).replace(/^﻿/, "");
    try { return { value: JSON.parse(s), repaired: false }; } catch (e0) { /* essai tolérant */ }
    var cand = s;
    var fence = /```[a-zA-Z]*\s*([\s\S]*?)```/.exec(s);
    if (fence && fence[1].indexOf("{") >= 0) cand = fence[1];
    var obj = extractFirstObject(cand);
    if (obj == null) {
      throw new Error("Fichier illisible (JSON invalide) : " + (cand.indexOf("{") >= 0
        ? "l'objet JSON n'est pas refermé (réponse tronquée ?)."
        : "aucun objet JSON trouvé."));
    }
    try { return { value: JSON.parse(stripTrailingCommas(obj)), repaired: true }; }
    catch (e) { throw new Error("Fichier illisible (JSON invalide) : " + e.message); }
  }

  /* ---------- validateur léger piloté par le schéma (fond) ----------
     Sous-ensemble de JSON Schema suffisant pour QUOTE_JSON_SCHEMA : const, type
     (unique ou liste), enum, pattern, minItems/maxItems, required, properties,
     items. Il renvoie TOUTES les erreurs d'un coup (chemin + message en français)
     pour que l'IA corrige en un seul aller-retour ; les champs inconnus ne bloquent
     pas, ils sont signalés (avertissements). Les clés commençant par « _ » sont
     réservées aux métadonnées. */
  var TYPE_FR = { string: "une chaîne de caractères", number: "un nombre", integer: "un entier", boolean: "un booléen (true/false)", object: "un objet", array: "un tableau", "null": "null" };
  function typeOk(v, t) {
    if (t === "null") return v === null;
    if (t === "array") return Array.isArray(v);
    if (t === "object") return isPlainObject(v);
    if (t === "integer") return typeof v === "number" && isFinite(v) && Math.floor(v) === v;
    if (t === "number") return typeof v === "number" && isFinite(v);
    return typeof v === t;
  }
  function describeValue(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "un tableau";
    if (typeof v === "object") return "un objet";
    if (typeof v === "string") return "la chaîne " + JSON.stringify(v.length > 40 ? v.slice(0, 40) + "…" : v);
    if (typeof v === "number") return "le nombre " + v;
    return String(v);
  }
  function joinPath(p, k) { return p ? p + "." + k : k; }

  function checkSchema(v, sch, path, errs, warns) {
    var where = path || "(fichier)";
    if (sch.hasOwnProperty("const") && v !== sch.const) {
      errs.push({ path: where, message: "doit valoir " + JSON.stringify(sch.const) + " (reçu : " + describeValue(v) + ")" });
      return;
    }
    if (sch.type) {
      var types = Array.isArray(sch.type) ? sch.type : [sch.type];
      if (!types.some(function (t) { return typeOk(v, t); })) {
        errs.push({ path: where, message: "attendu " + types.map(function (t) { return TYPE_FR[t] || t; }).join(" ou ") + ", reçu " + describeValue(v) });
        return;
      }
    }
    if (sch.enum && !sch.enum.some(function (e) { return e === v; })) {
      errs.push({ path: where, message: "valeur non autorisée (" + describeValue(v) + ") — valeurs possibles : " + sch.enum.map(function (e) { return JSON.stringify(e); }).join(", ") });
      return;
    }
    if (typeof v === "string" && sch.pattern && !new RegExp(sch.pattern).test(v)) {
      errs.push({ path: where, message: "format invalide (" + describeValue(v) + ")" + (sch.description ? " — " + sch.description : "") });
    }
    if (Array.isArray(v)) {
      if (sch.minItems != null && v.length < sch.minItems || sch.maxItems != null && v.length > sch.maxItems) {
        errs.push({ path: where, message: v.length + " élément(s), attendu " + (sch.minItems === sch.maxItems ? "exactement " + sch.minItems : "entre " + sch.minItems + " et " + sch.maxItems) + (sch.description ? " — " + sch.description : "") });
      }
      if (sch.items) for (var i = 0; i < v.length; i++) checkSchema(v[i], sch.items, path + "[" + i + "]", errs, warns);
    }
    if (isPlainObject(v)) {
      var props = sch.properties || {};
      (sch.required || []).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) {
          errs.push({ path: joinPath(path, k), message: "champ obligatoire manquant" + (props[k] && props[k].description ? " — " + props[k].description : "") });
        }
      });
      Object.keys(v).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(props, k)) checkSchema(v[k], props[k], joinPath(path, k), errs, warns);
        else if (sch.properties && k.charAt(0) !== "_") warns.push({ path: where, message: "champ inconnu « " + k + " » (conservé tel quel, sans effet dans ÉTABLI)" });
      });
    }
  }

  // Valide un fichier d'export de devis (déjà parsé) contre le schéma embarqué.
  function validateQuoteFile(obj) {
    var errors = [], warnings = [];
    checkSchema(obj, QUOTE_JSON_SCHEMA, "", errors, warnings);
    return { errors: errors, warnings: warnings };
  }

  var MAX_SHOWN_ERRORS = 20;
  function formatIssues(list) {
    var lines = list.slice(0, MAX_SHOWN_ERRORS).map(function (e) { return "• " + e.path + " : " + e.message; });
    if (list.length > MAX_SHOWN_ERRORS) lines.push("• … et " + (list.length - MAX_SHOWN_ERRORS) + " autre(s)");
    return lines.join("\n");
  }

  // Texte à coller à l'IA quand l'import a échoué (boucle « valider → renvoyer les erreurs »).
  function quoteFeedbackPrompt(message) {
    return "Le fichier JSON que tu m'as donné a été refusé par ÉTABLI à l'import. Voici les erreurs :\n" +
      strOf(message) +
      "\nCorrige uniquement ces points et renvoie le fichier JSON COMPLET : un seul objet JSON valide, mêmes clés app / kind / version / data.";
  }

  // Valide la STRUCTURE d'un devis venu d'un fichier (pas ses montants) pour qu'il
  // ne puisse pas faire planter l'appli au chargement : client objet, identifiants
  // de lignes présents et uniques. Un devis bien formé (celui que produit l'export)
  // ressort identique. (Les types et valeurs sont déjà contrôlés par le schéma.)
  function normalizeQuote(q) {
    if (!isPlainObject(q)) throw new Error("Devis invalide.");
    if (!Array.isArray(q.lines)) throw new Error("Devis invalide : la liste des lignes est absente.");
    var out = cloneJSON(q);
    delete out._savedAt;
    if (out.id == null || out.id === "") out.id = newQuoteId();
    out.numero = strOf(out.numero);
    var c = isPlainObject(out.client) ? out.client : {};
    ["nom", "adresse", "email", "tel"].forEach(function (k) { c[k] = strOf(c[k]); });
    out.client = c;
    var seen = {};
    out.lines = out.lines.map(function (l, i) {
      if (!isPlainObject(l)) throw new Error("Devis invalide : la ligne " + (i + 1) + " est illisible.");
      if (LINE_TYPES.indexOf(l.type) < 0) throw new Error("Devis invalide : type inconnu à la ligne " + (i + 1) + ".");
      if (l.id == null || l.id === "" || seen["k:" + l.id]) l.id = newLineId();
      seen["k:" + l.id] = true;
      return l;
    });
    return out;
  }

  // Lit un fichier d'export d'UN devis (chaîne JSON — éventuellement collée depuis
  // une conversation IA — ou objet) → { quote, warnings }. Erreurs explicites :
  // JSON illisible, autre appli, sauvegarde complète, puis la liste COMPLÈTE des
  // écarts au schéma (error.details = [{ path, message }]).
  function readQuoteExportDetailed(input) {
    var obj, warnings = [];
    if (typeof input === "string") {
      var parsed = parseJSONLenient(input);
      obj = parsed.value;
      if (parsed.repaired) warnings.push("JSON nettoyé automatiquement (bloc de code, texte autour ou virgule finale retirés).");
    } else {
      obj = input;
    }
    if (!isPlainObject(obj)) throw new Error("Ce fichier n'est pas un devis Établi.");
    if (obj.app !== BACKUP_APP) {
      throw new Error("Ce fichier n'est pas un devis Établi (app doit valoir \"etabli\", reçu : " + describeValue(obj.app) + ").");
    }
    if (obj.kind === undefined) {
      throw new Error("C'est une sauvegarde complète, pas un devis seul : utilise Réglages → « Restaurer… ». (Si ce fichier est un devis produit par une IA, il manque \"kind\": \"quote\".)");
    }
    var res = validateQuoteFile(obj);
    if (res.errors.length) {
      var err = new Error("Le devis du fichier n'est pas valide (" + res.errors.length + " erreur" + (res.errors.length > 1 ? "s" : "") + ") :\n" + formatIssues(res.errors));
      err.details = res.errors;
      throw err;
    }
    res.warnings.forEach(function (w) { warnings.push(w.path + " : " + w.message); });
    return { quote: normalizeQuote(obj.data.quotes[0]), warnings: warnings };
  }
  function readQuoteExport(input) { return readQuoteExportDetailed(input).quote; }

  // Sérialisation JSON à clés triées : deux devis de même contenu donnent la même chaîne.
  function stableStringify(v) {
    if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) {
        return JSON.stringify(k) + ":" + stableStringify(v[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(v);
  }
  // Même devis, hors horodatage d'enregistrement ?
  function sameQuoteContent(a, b) {
    function bare(q) { var c = {}; for (var k in q) if (Object.prototype.hasOwnProperty.call(q, k) && k !== "_savedAt") c[k] = q[k]; return c; }
    return stableStringify(bare(a || {})) === stableStringify(bare(b || {}));
  }

  // Ajoute un devis importé à la liste, SANS rien écraser.
  // Rend { list, status, quote, numeroClash } :
  //   status "added"     — nouvel identifiant : ajouté en tête ;
  //   status "duplicate" — même id et même contenu : liste inchangée ;
  //   status "copy"      — même id, contenu différent : ajouté sous un NOUVEL id ;
  //   numeroClash        — un autre devis (autre id) porte déjà ce numéro (information :
  //                        le numéro n'est jamais modifié, il appartient à l'utilisateur).
  function addImportedQuote(list, quote) {
    list = Array.isArray(list) ? list.slice() : [];
    var q = quote, status = "added", key = quoteKey(quote);
    for (var i = 0; i < list.length; i++) {
      if (quoteKey(list[i]) !== key) continue;
      if (sameQuoteContent(list[i], quote)) {
        return { list: list, status: "duplicate", quote: list[i], numeroClash: false };
      }
      q = {};
      for (var k in quote) if (Object.prototype.hasOwnProperty.call(quote, k)) q[k] = quote[k];
      q.id = newQuoteId();
      status = "copy";
      break;
    }
    var clash = false;
    if (strOf(q.numero) !== "") {
      for (var j = 0; j < list.length; j++) {
        if (list[j] && strOf(list[j].numero) === strOf(q.numero) && quoteKey(list[j]) !== quoteKey(q)) { clash = true; break; }
      }
    }
    return { list: [q].concat(list), status: status, quote: q, numeroClash: clash };
  }

  /* =========================================================================
     CALEPINAGE — bin packing « guillotine » tenant compte du trait de scie.
     Toutes les longueurs partagent la même unité (l'UI utilise le mm).
     On essaie plusieurs heuristiques (tri × score × découpe) et on garde le
     plan avec le moins de panneaux, puis le moins de chute.
     ========================================================================= */
  var EPSILON = 0.0001;
  var MAX_EXPANDED_PIECES = 2000;

  var SORT_STRATEGIES = [
    // surface décroissante
    function (a, b) { return b.width * b.height - a.width * a.height; },
    // plus grand côté décroissant (pièces longues d'abord)
    function (a, b) { return Math.max(b.width, b.height) - Math.max(a.width, a.height); },
    // plus petit côté décroissant
    function (a, b) { return Math.min(b.width, b.height) - Math.min(a.width, a.height); },
    // périmètre décroissant
    function (a, b) { return (b.width + b.height) - (a.width + a.height); },
  ];

  // score bas = meilleur emplacement
  var SCORE_FNS = [
    function (rw, rh, pw, ph) { return rw * rh - pw * ph; },        // Best Area Fit
    function (rw, rh, pw, ph) { return Math.min(rw - pw, rh - ph); }, // Best Short Side Fit
    function (rw, rh, pw, ph) { return Math.max(rw - pw, rh - ph); }, // Best Long Side Fit
  ];

  // true → garder une bande verticale (à droite) ; false → bande horizontale (en bas)
  var SPLIT_FNS = [
    function (rectW, rectH, rightW, bottomH) { return rightW * rectH >= rectW * bottomH; },
    function () { return true; },
    function () { return false; },
  ];

  function expandPieces(pieces) {
    var result = [];
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var w = num(p.width), h = num(p.height), q = Math.floor(num(p.quantity));
      if (w <= 0 || h <= 0 || q <= 0) continue;
      for (var k = 0; k < q; k++) {
        result.push({ id: p.id, label: p.label, width: w, height: h, color: p.color });
      }
    }
    return result;
  }

  function fitsInRect(pieceW, pieceH, rect, kerf, tolerance) {
    var needKerfRight = pieceW < rect.width - EPSILON;
    var needKerfBottom = pieceH < rect.height - EPSILON;
    var totalW = pieceW + (needKerfRight ? kerf : 0);
    var totalH = pieceH + (needKerfBottom ? kerf : 0);
    return totalW <= rect.width + tolerance + EPSILON && totalH <= rect.height + tolerance + EPSILON;
  }

  function findBestPlacement(piece, sheets, config, scoreFn) {
    var best = null;
    var tolerance = config.oversizeTolerance || 0;
    for (var si = 0; si < sheets.length; si++) {
      var rects = sheets[si].freeRects;
      for (var ri = 0; ri < rects.length; ri++) {
        var rect = rects[ri];
        // orientation normale
        if (fitsInRect(piece.width, piece.height, rect, config.kerf, tolerance)) {
          var s1 = scoreFn(rect.width, rect.height, piece.width, piece.height);
          if (!best || s1 < best.score) {
            best = { sheetIndex: si, rectIndex: ri, x: rect.x, y: rect.y, width: piece.width, height: piece.height, rotated: false, score: s1 };
          }
        }
        // orientation tournée (seulement si le fil du bois n'impose rien)
        if (!config.grainDirection && piece.width !== piece.height) {
          if (fitsInRect(piece.height, piece.width, rect, config.kerf, tolerance)) {
            var s2 = scoreFn(rect.width, rect.height, piece.height, piece.width);
            if (!best || s2 < best.score) {
              best = { sheetIndex: si, rectIndex: ri, x: rect.x, y: rect.y, width: piece.height, height: piece.width, rotated: true, score: s2 };
            }
          }
        }
      }
    }
    return best;
  }

  function placePiece(piece, placement, sheets, config, splitFn) {
    var sheet = sheets[placement.sheetIndex];
    var rect = sheet.freeRects[placement.rectIndex];
    sheet.placed.push({
      pieceId: piece.id, label: piece.label,
      x: placement.x, y: placement.y, width: placement.width, height: placement.height,
      rotated: placement.rotated, color: piece.color,
    });
    sheet.freeRects.splice(placement.rectIndex, 1);

    var kerf = config.kerf;
    var needKerfRight = placement.width < rect.width - EPSILON;
    var needKerfBottom = placement.height < rect.height - EPSILON;
    var consumedW = placement.width + (needKerfRight ? kerf : 0);
    var consumedH = placement.height + (needKerfBottom ? kerf : 0);
    var rightW = Math.max(0, rect.width - consumedW);
    var bottomH = Math.max(0, rect.height - consumedH);
    var splitHoriz = splitFn(rect.width, rect.height, rightW, bottomH);

    if (splitHoriz) {
      if (rightW > kerf) sheet.freeRects.push({ x: rect.x + consumedW, y: rect.y, width: rightW, height: rect.height });
      if (bottomH > kerf) sheet.freeRects.push({ x: rect.x, y: rect.y + consumedH, width: placement.width, height: bottomH });
    } else {
      if (bottomH > kerf) sheet.freeRects.push({ x: rect.x, y: rect.y + consumedH, width: rect.width, height: bottomH });
      if (rightW > kerf) sheet.freeRects.push({ x: rect.x + consumedW, y: rect.y, width: rightW, height: placement.height });
    }
  }

  function runPacking(expanded, originalPieces, config, scoreFn, splitFn) {
    var sheets = [];
    var unfitPieces = [];
    for (var i = 0; i < expanded.length; i++) {
      var piece = expanded[i];
      var placement = findBestPlacement(piece, sheets, config, scoreFn);
      if (placement) {
        placePiece(piece, placement, sheets, config, splitFn);
      } else {
        sheets.push({ freeRects: [{ x: 0, y: 0, width: config.width, height: config.height }], placed: [] });
        var np = findBestPlacement(piece, sheets, config, scoreFn);
        if (np) {
          placePiece(piece, np, sheets, config, splitFn);
        } else {
          sheets.pop();
          if (!findById(unfitPieces, piece.id)) {
            var orig = findById(originalPieces, piece.id);
            if (orig) unfitPieces.push(orig);
          }
        }
      }
    }

    var sheetArea = config.width * config.height;
    var sheetLayouts = sheets.map(function (sheet, idx) {
      var usedArea = sheet.placed.reduce(function (sum, p) { return sum + p.width * p.height; }, 0);
      return { sheetIndex: idx, pieces: sheet.placed, wastePercent: (1 - usedArea / sheetArea) * 100 };
    });
    var totalUsedArea = sheetLayouts.reduce(function (sum, s) {
      return sum + s.pieces.reduce(function (ps, p) { return ps + p.width * p.height; }, 0);
    }, 0);
    var totalArea = sheetLayouts.length * sheetArea;

    return {
      sheets: sheetLayouts,
      totalSheets: sheetLayouts.length,
      totalWastePercent: totalArea > 0 ? (1 - totalUsedArea / totalArea) * 100 : 0,
      unfitPieces: unfitPieces,
    };
  }

  function findById(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function isBetterResult(a, b) {
    if (a.unfitPieces.length !== b.unfitPieces.length) return a.unfitPieces.length < b.unfitPieces.length;
    if (a.totalSheets !== b.totalSheets) return a.totalSheets < b.totalSheets;
    return a.totalWastePercent < b.totalWastePercent;
  }

  function calculateCutlist(pieces, config) {
    var cfg = {
      width: num(config.width),
      height: num(config.height),
      kerf: num(config.kerf),
      grainDirection: !!config.grainDirection,
      oversizeTolerance: num(config.oversizeTolerance),
    };
    var expanded = expandPieces(pieces || []);

    if (cfg.width <= 0 || cfg.height <= 0 || expanded.length > MAX_EXPANDED_PIECES) {
      return { sheets: [], totalSheets: 0, totalWastePercent: 0, unfitPieces: (pieces || []).slice() };
    }
    if (expanded.length === 0) {
      return { sheets: [], totalSheets: 0, totalWastePercent: 0, unfitPieces: [] };
    }

    var best = null;
    for (var a = 0; a < SORT_STRATEGIES.length; a++) {
      var sorted = expanded.slice().sort(SORT_STRATEGIES[a]);
      for (var b = 0; b < SCORE_FNS.length; b++) {
        for (var c = 0; c < SPLIT_FNS.length; c++) {
          var result = runPacking(sorted, pieces, cfg, SCORE_FNS[b], SPLIT_FNS[c]);
          if (!best || isBetterResult(result, best)) best = result;
        }
      }
    }
    return best;
  }

  /* ---------- coût des panneaux (panneaux entiers uniquement) ----------
     unitToM : facteur de conversion d'une dimension stock vers le mètre
     (mm → 0.001, cm → 0.01). Défaut : mm. */
  function panelMetrics(result, config, pricePerM2, unitToM) {
    var f = (unitToM == null) ? 0.001 : unitToM;
    var areaM2 = (num(config.width) * f) * (num(config.height) * f);
    var costPerPanel = areaM2 * num(pricePerM2);
    var totalSheets = result ? result.totalSheets : 0;
    return {
      totalSheets: totalSheets,
      areaM2PerPanel: areaM2,
      costPerPanel: costPerPanel,
      totalCost: totalSheets * costPerPanel,
      totalWastePercent: result ? result.totalWastePercent : 0,
    };
  }

  /* ---------- liste de débit à copier/coller (fournisseur) ----------
     Regroupe les pièces par cote (L×l) et quantité — texte simple, séparateur
     tabulation, pratique à coller dans un mail ou un tableur. */
  function cutListText(pieces, opts) {
    opts = opts || {};
    var unit = opts.unit || "mm";
    var sep = opts.separator || "\t";
    var groups = {};
    var order = [];
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var w = num(p.width), h = num(p.height), q = Math.floor(num(p.quantity));
      if (w <= 0 || h <= 0 || q <= 0) continue;
      var label = (p.label || "Pièce");
      var key = label + "|" + w + "x" + h;
      if (!groups[key]) { groups[key] = { label: label, width: w, height: h, qty: 0 }; order.push(key); }
      groups[key].qty += q;
    }
    var lines = [["Qté", "Désignation", "Longueur (" + unit + ")", "Largeur (" + unit + ")"].join(sep)];
    var totalPieces = 0;
    for (var j = 0; j < order.length; j++) {
      var g = groups[order[j]];
      totalPieces += g.qty;
      lines.push([g.qty, g.label, g.width, g.height].join(sep));
    }
    return { text: lines.join("\n"), totalPieces: totalPieces, distinct: order.length };
  }

  /* =========================================================================
     MÈTRE LINÉAIRE — baguettes, profilés, plinthes… (barres à débiter en long).
     Deux usages, un seul vocabulaire :
       1. ligne de fourniture « au mètre linéaire » : somme des longueurs
          saisies (+ chute %) → quantité en ml (linearTotal / linearLineQty) ;
       2. calepinage 1D : on débite des longueurs dans des barres de stock en
          tenant compte du trait de scie → nombre de barres entières, chute,
          coût au ml ou à la barre (calculateLinearCutlist / linearMetrics).
     ========================================================================= */
  var LINEAR_UNIT_TO_M = { mm: 0.001, cm: 0.01, m: 1 };
  function linearUnitFactor(unit) {
    return Object.prototype.hasOwnProperty.call(LINEAR_UNIT_TO_M, unit) ? LINEAR_UNIT_TO_M[unit] : 1;
  }
  function roundTo(n, d) {
    var k = Math.pow(10, d);
    return Math.round(n * k) / k;
  }
  // 1234.5 → "1234,5" (au plus d décimales, sans zéros inutiles) — pour les textes générés.
  function fmtFr(n, d) {
    return String(roundTo(num(n), d == null ? 2 : d)).replace(".", ",");
  }

  // Σ longueur × quantité d'une liste [{ len, qty }] saisie dans `unit` (mm|cm|m).
  // Les lignes sans longueur ou sans quantité entière ≥ 1 sont ignorées.
  function linearTotal(items, unit) {
    var f = linearUnitFactor(unit);
    var totalM = 0, pieces = 0, distinct = 0;
    items = Array.isArray(items) ? items : [];
    for (var i = 0; i < items.length; i++) {
      var len = num(items[i] && items[i].len);
      var q = Math.floor(num(items[i] && items[i].qty));
      if (len <= 0 || q <= 0) continue;
      totalM += len * q * f;
      pieces += q;
      distinct += 1;
    }
    return { totalM: totalM, pieces: pieces, distinct: distinct };
  }

  // Quantité (en ml) d'une ligne de fourniture « au mètre linéaire » :
  // longueurs saisies (mlItems, dans mlUnit) majorées de la chute (mlPerte, %).
  function linearLineQty(line) {
    line = line || {};
    var t = linearTotal(line.mlItems, line.mlUnit);
    var perte = Math.max(0, num(line.mlPerte));
    return {
      totalM: roundTo(t.totalM, 4),
      pieces: t.pieces,
      distinct: t.distinct,
      perte: perte,
      qteM: roundTo(t.totalM * (1 + perte / 100), 4),
    };
  }

  // Détail de métré prêt à coller dans le champ « métré » (syntaxe liste du
  // texte enrichi : une puce par longueur).
  function linearDetailText(line) {
    line = line || {};
    var unit = LINEAR_UNIT_TO_M.hasOwnProperty(line.mlUnit) ? line.mlUnit : "m";
    var items = Array.isArray(line.mlItems) ? line.mlItems : [];
    var rows = [];
    for (var i = 0; i < items.length; i++) {
      var len = num(items[i] && items[i].len);
      var q = Math.floor(num(items[i] && items[i].qty));
      if (len <= 0 || q <= 0) continue;
      rows.push("- " + q + " × " + fmtFr(len, 3) + " " + unit);
    }
    if (!rows.length) return "";
    var r = linearLineQty(line);
    var total = "Total : " + fmtFr(r.totalM, 2) + " ml";
    if (r.perte > 0) total += " + " + fmtFr(r.perte, 1) + " % de chute = " + fmtFr(r.qteM, 2) + " ml";
    return ["Longueurs :"].concat(rows, [total]).join("\n");
  }

  /* ---------- calepinage 1D : barres de stock + trait de scie ----------
     pieces : [{ id, label, length, quantity, color }]   config : { barLength, kerf }
     Même unité partout (l'UI passe des mm). First-Fit et Best-Fit Decreasing,
     on garde le plan avec le moins de barres. Un trait de scie est consommé
     après chaque pièce, sauf si la pièce épuise la barre ; le dernier trait
     mord sur la chute, donc une pièce tient dès qu'elle ≤ le reste de barre. */
  function expandLinear(pieces) {
    var result = [];
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var len = num(p.length), q = Math.floor(num(p.quantity));
      if (len <= 0 || q <= 0) continue;
      for (var k = 0; k < q; k++) result.push({ id: p.id, label: p.label, length: len, color: p.color });
    }
    return result;
  }

  function packBars(expanded, originalPieces, cfg, bestFit) {
    var bars = [];
    var unfitPieces = [];
    for (var i = 0; i < expanded.length; i++) {
      var piece = expanded[i];
      var target = -1, bestLeft = Infinity;
      for (var b = 0; b < bars.length; b++) {
        if (piece.length <= bars[b].remaining + EPSILON) {
          if (!bestFit) { target = b; break; }
          var left = bars[b].remaining - piece.length;
          if (left < bestLeft) { bestLeft = left; target = b; }
        }
      }
      if (target < 0) {
        if (piece.length > cfg.barLength + EPSILON) {
          if (!findById(unfitPieces, piece.id)) {
            var orig = findById(originalPieces, piece.id);
            if (orig) unfitPieces.push(orig);
          }
          continue;
        }
        bars.push({ remaining: cfg.barLength, cursor: 0, placed: [] });
        target = bars.length - 1;
      }
      var bar = bars[target];
      bar.placed.push({ pieceId: piece.id, label: piece.label, x: bar.cursor, length: piece.length, color: piece.color });
      var leftover = bar.remaining - piece.length;
      if (leftover > EPSILON) {
        bar.cursor += piece.length + cfg.kerf;
        bar.remaining = Math.max(0, leftover - cfg.kerf);
      } else {
        bar.cursor += piece.length;
        bar.remaining = 0;
      }
    }

    var usedLength = 0;
    var layouts = bars.map(function (bar, idx) {
      var used = bar.placed.reduce(function (s, p) { return s + p.length; }, 0);
      usedLength += used;
      return {
        barIndex: idx,
        pieces: bar.placed,
        usedLength: used,
        wasteLength: cfg.barLength - used,
        wastePercent: (1 - used / cfg.barLength) * 100,
      };
    });
    var totalLength = layouts.length * cfg.barLength;
    return {
      bars: layouts,
      totalBars: layouts.length,
      barLength: cfg.barLength,
      usedLength: usedLength,
      totalLength: totalLength,
      totalWastePercent: totalLength > 0 ? (1 - usedLength / totalLength) * 100 : 0,
      unfitPieces: unfitPieces,
    };
  }

  function calculateLinearCutlist(pieces, config) {
    var cfg = { barLength: num(config && config.barLength), kerf: Math.max(0, num(config && config.kerf)) };
    var expanded = expandLinear(pieces || []);
    var empty = { bars: [], totalBars: 0, barLength: cfg.barLength, usedLength: 0, totalLength: 0, totalWastePercent: 0, unfitPieces: [] };
    if (cfg.barLength <= 0 || expanded.length > MAX_EXPANDED_PIECES) {
      empty.unfitPieces = (pieces || []).slice();
      return empty;
    }
    if (expanded.length === 0) return empty;

    var sorted = expanded.slice().sort(function (a, b) { return b.length - a.length; });
    var best = null;
    for (var mode = 0; mode < 2; mode++) {
      var result = packBars(sorted, pieces, cfg, mode === 1);
      if (!best || isBetterLinear(result, best)) best = result;
    }
    return best;
  }

  function isBetterLinear(a, b) {
    if (a.unfitPieces.length !== b.unfitPieces.length) return a.unfitPieces.length < b.unfitPieces.length;
    if (a.totalBars !== b.totalBars) return a.totalBars < b.totalBars;
    return a.totalWastePercent < b.totalWastePercent;
  }

  /* ---------- coût des barres ----------
     config.barLength : longueur d'une barre (unité de saisie ; unitToM → mètres, défaut mm)
     price            : prix saisi — opts.priceUnit "ml" (€/m, défaut) ou "bar" (€/barre)
     opts.billing     : "bar" = barres entières achetées (défaut) ; "ml" = seulement
                        les mètres réellement débités (fournisseur qui coupe à la demande)
     Les deux prix (au ml ET à la barre) sont toujours dérivés l'un de l'autre. */
  function linearMetrics(result, config, price, opts) {
    opts = opts || {};
    var f = opts.unitToM == null ? 0.001 : opts.unitToM;
    var barM = num(config && config.barLength) * f;
    var priceUnit = opts.priceUnit === "bar" ? "bar" : "ml";
    var billing = opts.billing === "ml" ? "ml" : "bar";
    var p = num(price);
    var pricePerMl = priceUnit === "ml" ? p : (barM > 0 ? p / barM : 0);
    var pricePerBar = priceUnit === "bar" ? p : p * barM;
    var totalBars = result ? result.totalBars : 0;
    var usedM = result ? result.usedLength * f : 0;
    var boughtM = totalBars * barM;
    return {
      totalBars: totalBars,
      barLengthM: barM,
      pricePerMl: pricePerMl,
      pricePerBar: pricePerBar,
      usedM: usedM,
      boughtM: boughtM,
      billing: billing,
      billedM: billing === "ml" ? usedM : boughtM,
      totalCost: billing === "ml" ? usedM * pricePerMl : totalBars * pricePerBar,
      totalWastePercent: result ? result.totalWastePercent : 0,
    };
  }

  // Liste de débit 1D (tabulée) : quantité, désignation, longueur.
  function linearCutListText(pieces, opts) {
    opts = opts || {};
    var unit = opts.unit || "mm";
    var sep = opts.separator || "\t";
    var groups = {}, order = [], i;
    pieces = pieces || [];
    for (i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var len = num(p.length), q = Math.floor(num(p.quantity));
      if (len <= 0 || q <= 0) continue;
      var label = p.label || "Pièce";
      var key = label + "|" + len;
      if (!groups[key]) { groups[key] = { label: label, length: len, qty: 0 }; order.push(key); }
      groups[key].qty += q;
    }
    var lines = [["Qté", "Désignation", "Longueur (" + unit + ")"].join(sep)];
    var totalPieces = 0, totalLength = 0;
    for (var j = 0; j < order.length; j++) {
      var g = groups[order[j]];
      totalPieces += g.qty;
      totalLength += g.qty * g.length;
      lines.push([g.qty, g.label, g.length].join(sep));
    }
    return { text: lines.join("\n"), totalPieces: totalPieces, distinct: order.length, totalLength: totalLength };
  }

  /* =========================================================================
     TEXTE ENRICHI — formatage léger des champs libres (métré, conditions,
     description du chantier). Le texte reste du TEXTE BRUT dans le stockage et
     les sauvegardes : un balisage minimal, rendu ensuite par l'UI en éléments
     React (jamais de HTML injecté → pas de XSS).

       **gras**   *italique*   __souligné__   (combinables : ***gras italique***)
       - puce      • puce        1. numérotée   (en début de ligne)
       \*  \_     pour afficher un * ou un _ tel quel

     Règle de « bord de mot » (comme WhatsApp/Markdown) : une marque ouvrante ne
     doit pas être collée à la fin d'un mot, ni suivie d'une espace ; une marque
     fermante ne doit pas être précédée d'une espace ni collée au début d'un mot.
     Ainsi « 3*4 », « réf_12_B » ou « 2 * 3 » restent du texte ordinaire.
     ========================================================================= */
  var RT_MARKERS = [{ m: "**", key: "b" }, { m: "__", key: "u" }, { m: "*", key: "i" }];

  function isWordCh(c) { return !!c && /[\p{L}\p{N}]/u.test(c); }
  function isSpaceCh(c) { return !c || /\s/.test(c); }

  // Si une marque s'ouvre en `p`, renvoie { runs, next } (rendu de son contenu
  // et position de reprise) ; sinon null.
  function richMatch(s, p, fmt) {
    for (var k = 0; k < RT_MARKERS.length; k++) {
      var mk = RT_MARKERS[k].m, L = mk.length, ch = mk.charAt(0);
      if (s.substr(p, L) !== mk) continue;
      if (L === 1 && s.charAt(p + 1) === ch) continue;   // début de « ** », pas un italique
      if (isWordCh(s.charAt(p - 1))) continue;           // collé à la fin d'un mot : 3*4
      if (isSpaceCh(s.charAt(p + L))) continue;          // suivie d'une espace / fin
      var q = p + L, j = q + 1;
      while (j < s.length) {
        if (s.charAt(j) !== ch || s.charAt(j - 1) === "\\") { j++; continue; }
        var e = j;                                        // fin du run de marques
        while (s.charAt(e) === ch) e++;
        var cs = -1;                                      // début de la marque fermante
        if (L === 1) { if (e - j === 1) cs = j; }
        else if (e - j >= 2) cs = e - 2;                  // « *** » : l'excédent reste dedans
        if (cs >= 0 && !isSpaceCh(s.charAt(j - 1)) && !isWordCh(s.charAt(e))) {
          var f2 = { b: fmt.b, i: fmt.i, u: fmt.u };
          f2[RT_MARKERS[k].key] = true;
          return { runs: parseInline(s.slice(q, cs), f2), next: cs + L };
        }
        j = e;
      }
    }
    return null;
  }

  // Texte d'un paragraphe → suite de segments { text, b, i, u }.
  function parseInline(s, fmt) {
    fmt = fmt || { b: false, i: false, u: false };
    var out = [], buf = "", p = 0;
    function flush() {
      if (buf) { out.push({ text: buf, b: !!fmt.b, i: !!fmt.i, u: !!fmt.u }); buf = ""; }
    }
    while (p < s.length) {
      var ch = s.charAt(p);
      if (ch === "\\" && (s.charAt(p + 1) === "*" || s.charAt(p + 1) === "_")) {
        buf += s.charAt(p + 1); p += 2; continue;
      }
      var m = (ch === "*" || ch === "_") ? richMatch(s, p, fmt) : null;
      if (m) { flush(); out = out.concat(m.runs); p = m.next; continue; }
      buf += ch; p++;
    }
    flush();
    return out;
  }

  var UL_RE = /^(\s*)[-•]\s+/;
  var OL_RE = /^(\s*)\d+[.)]\s+/;

  // Texte entier → blocs : { type:"p", runs } | { type:"ul", items:[runs] } |
  // { type:"ol", start, items:[runs] }. Les lignes consécutives hors liste restent
  // groupées dans un même paragraphe (les retours à la ligne y sont conservés).
  function parseRichText(text) {
    var lines = String(text == null ? "" : text).split(/\r?\n/);
    var blocks = [], para = [], list = null;
    function flushPara() {
      var from = 0, to = para.length;
      while (from < to && para[from].trim() === "") from++;
      while (to > from && para[to - 1].trim() === "") to--;
      if (to > from) blocks.push({ type: "p", runs: parseInline(para.slice(from, to).join("\n")) });
      para = [];
    }
    function flushList() { if (list) { blocks.push(list); list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i], m;
      if ((m = /^\s*[-•]\s+(.*)$/.exec(line))) {
        flushPara();
        if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
        list.items.push(parseInline(m[1]));
      } else if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) {
        flushPara();
        if (!list || list.type !== "ol") { flushList(); list = { type: "ol", start: parseInt(m[1], 10), items: [] }; }
        list.items.push(parseInline(m[2]));
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
    return blocks;
  }

  // Vrai si le texte contient au moins une mise en forme (gras/italique/souligné/liste).
  function hasRichFormatting(text) {
    var blocks = parseRichText(text);
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type !== "p") return true;
      for (var j = 0; j < b.runs.length; j++) {
        if (b.runs[j].b || b.runs[j].i || b.runs[j].u) return true;
      }
    }
    return false;
  }

  /* ---------- barre d'outils : appliquer / retirer une mise en forme ----------
     applyTextFormat(text, start, end, kind) → { text, start, end }
     kind : "bold" | "italic" | "underline" | "ul" | "ol"
     La sélection est renvoyée pour que l'UI la restaure ; appliquer deux fois la
     même mise en forme la retire (bascule). Fonctions pures, sans DOM. */
  var INLINE_FMT = { bold: "**", italic: "*", underline: "__" };

  // Une série de k marques autour d'un texte signifie-t-elle « kind actif » ?
  // k=1 italique · k=2 gras · k=3 gras+italique (donc k impair → italique, k≥2 → gras)
  function markActive(kind, k) {
    if (kind === "italic") return k % 2 === 1;
    return k >= 2; // bold, underline
  }

  // « Couches » de marques (suites de * ou de _) accolées à idx, de la plus proche
  // à la plus lointaine : "**__mot" lu depuis la fin donne [__ , **]. dir<0 : vers la
  // gauche à partir de idx ; dir>0 : vers la droite. [lo,hi) borne la zone lue.
  function markLayers(text, idx, dir, lo, hi) {
    var layers = [], pos = idx;
    function at(i) { return i < lo || i >= hi ? "" : text.charAt(i); }
    while (true) {
      var c = dir < 0 ? at(pos - 1) : at(pos);
      if (c !== "*" && c !== "_") break;
      var n = 0;
      while ((dir < 0 ? at(pos - 1 - n) : at(pos + n)) === c) n++;
      layers.push({ ch: c, n: n, from: dir < 0 ? pos - n : pos, to: dir < 0 ? pos : pos + n });
      pos = dir < 0 ? pos - n : pos + n;
    }
    return layers;
  }

  // Première couche appariée (même rang, même caractère des deux côtés) où `kind`
  // est actif. Les couches des autres mises en forme (p. ex. __ autour de **)
  // sont enjambées : le gras reste détectable après un souligné.
  function findMark(kind, a, b) {
    var ch = INLINE_FMT[kind].charAt(0);
    for (var i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i].ch !== b[i].ch) break;
      if (a[i].ch === ch && markActive(kind, Math.min(a[i].n, b[i].n))) return { a: a[i], b: b[i] };
    }
    return null;
  }

  // Segments (un par ligne, espaces de bord rognés) couverts par la sélection.
  function inlineSegments(text, start, end) {
    var segs = [];
    if (end <= start) return segs;
    var pos = start;
    while (pos <= end) {
      var nl = text.indexOf("\n", pos);
      var s = pos, e = (nl < 0 || nl > end) ? end : nl;
      while (s < e && /\s/.test(text.charAt(s))) s++;
      while (e > s && /\s/.test(text.charAt(e - 1))) e--;
      if (e > s) segs.push([s, e]);
      if (nl < 0 || nl >= end) break;
      pos = nl + 1;
    }
    return segs;
  }

  // Le segment [s,e) est-il déjà mis en forme ? { mode:"inside", a, b } (marques
  // dans la sélection, positions relatives à s) | { mode:"outside", a, b }
  // (marques collées autour, positions absolues) | null.
  function inlineProbe(text, s, e, kind) {
    var sel = text.slice(s, e);
    var inA = markLayers(sel, 0, 1, 0, sel.length);
    var after = inA.length ? inA[inA.length - 1].to : 0;
    var inB = markLayers(sel, sel.length, -1, after, sel.length);
    var m = findMark(kind, inA, inB);
    if (m) return { mode: "inside", a: m.a, b: m.b };
    m = findMark(kind, markLayers(text, s, -1, 0, text.length), markLayers(text, e, 1, 0, text.length));
    if (m) return { mode: "outside", a: m.a, b: m.b };
    return null;
  }

  // Applique `mode` ("wrap" ou la sonde d'un segment) sur [s,e) ; rend le nouveau
  // texte, la sélection intérieure (s,e) et la sélection englobant les marques (os,oe).
  function inlineApply(text, s, e, kind, probe) {
    var mk = INLINE_FMT[kind], L = mk.length;
    if (!probe) {
      return { text: text.slice(0, s) + mk + text.slice(s, e) + mk + text.slice(e), s: s + L, e: e + L, os: s, oe: e + 2 * L };
    }
    var abs = probe.mode === "inside" ? s : 0;
    var aFrom = abs + probe.a.from, bFrom = abs + probe.b.from;
    var out = text.slice(0, bFrom) + text.slice(bFrom + L);   // d'abord la droite (indices plus grands)
    out = out.slice(0, aFrom) + out.slice(aFrom + L);
    if (probe.mode === "inside") return { text: out, s: s, e: e - 2 * L, os: s, oe: e - 2 * L };
    return { text: out, s: s - L, e: e - L, os: s - L, oe: e - L };
  }

  function toggleInline(text, start, end, kind) {
    var segs = inlineSegments(text, start, end);
    var mk = INLINE_FMT[kind], L = mk.length;
    if (!segs.length) {
      // pas de sélection : insère une paire de marques (curseur entre les deux),
      // ou retire la paire vide si le curseur est déjà dedans.
      var pos = end;
      var around = findMark(kind, markLayers(text, pos, -1, 0, text.length), markLayers(text, pos, 1, 0, text.length));
      if (around) {
        var out0 = text.slice(0, around.b.from) + text.slice(around.b.from + L);
        out0 = out0.slice(0, around.a.from) + out0.slice(around.a.from + L);
        return { text: out0, start: pos - L, end: pos - L };
      }
      return { text: text.slice(0, pos) + mk + mk + text.slice(pos), start: pos + L, end: pos + L };
    }
    var probes = segs.map(function (sg) { return inlineProbe(text, sg[0], sg[1], kind); });
    var allActive = probes.every(function (pr) { return !!pr; });
    var out = text, first = null, last = null, growth = 0;
    for (var i = segs.length - 1; i >= 0; i--) {
      var r;
      if (allActive) r = inlineApply(out, segs[i][0], segs[i][1], kind, probes[i]);
      else if (probes[i]) r = { text: out, s: segs[i][0], e: segs[i][1], os: segs[i][0], oe: segs[i][1] };
      else r = inlineApply(out, segs[i][0], segs[i][1], kind, null);
      if (i === segs.length - 1) last = r; else growth += r.text.length - out.length;
      if (i === 0) first = r;
      out = r.text;
    }
    if (segs.length === 1) return { text: out, start: first.s, end: first.e };
    // plusieurs lignes : la sélection englobe les marques de chaque ligne, de sorte
    // qu'un 2ᵉ clic retrouve exactement les mêmes segments.
    return { text: out, start: first.os, end: last.oe + growth };
  }

  function toggleList(text, start, end, kind) {
    var from = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
    var last = (end > start && text.charAt(end - 1) === "\n") ? end - 1 : end;
    var nl = text.indexOf("\n", last);
    var to = nl < 0 ? text.length : nl;
    var lines = text.slice(from, to).split("\n");
    var target = kind === "ul" ? UL_RE : OL_RE;
    var single = lines.length === 1;
    var active = lines.filter(function (l) { return single || l.trim() !== ""; });
    if (!active.length) return { text: text, start: start, end: end }; // que des lignes vides : rien à faire
    var allOn = active.every(function (l) { return target.test(l); });
    var n = 0;
    var out = lines.map(function (l) {
      if (!single && l.trim() === "") return l;
      var body = l.replace(/^(\s*)([-•]|\d+[.)])\s+/, "$1");
      if (allOn) return body;
      var indent = /^\s*/.exec(body)[0];
      n += 1;
      return indent + (kind === "ul" ? "- " : n + ". ") + body.slice(indent.length);
    });
    var joined = out.join("\n");
    var res = text.slice(0, from) + joined + text.slice(to);
    if (start === end) {
      var shift = out[0].length - lines[0].length;
      var caret = Math.max(from, start + shift);
      return { text: res, start: caret, end: caret };
    }
    return { text: res, start: from, end: from + joined.length };
  }

  function applyTextFormat(text, start, end, kind) {
    text = String(text == null ? "" : text);
    start = Math.max(0, Math.min(text.length, num(start)));
    end = Math.max(0, Math.min(text.length, num(end)));
    if (end < start) { var t = start; start = end; end = t; }
    if (kind === "ul" || kind === "ol") return toggleList(text, start, end, kind);
    if (!INLINE_FMT[kind]) return { text: text, start: start, end: end };
    return toggleInline(text, start, end, kind);
  }

  return {
    num: num,
    computeLine: computeLine,
    tvaBreakdown: tvaBreakdown,
    calculateCutlist: calculateCutlist,
    panelMetrics: panelMetrics,
    cutListText: cutListText,
    linearTotal: linearTotal,
    linearLineQty: linearLineQty,
    linearDetailText: linearDetailText,
    calculateLinearCutlist: calculateLinearCutlist,
    linearMetrics: linearMetrics,
    linearCutListText: linearCutListText,
    parseRichText: parseRichText,
    hasRichFormatting: hasRichFormatting,
    applyTextFormat: applyTextFormat,
    expandPieces: expandPieces,
    newQuoteId: newQuoteId,
    upsertQuote: upsertQuote,
    removeQuote: removeQuote,
    nextQuoteNumero: nextQuoteNumero,
    buildBackup: buildBackup,
    readBackup: readBackup,
    mergeQuotes: mergeQuotes,
    buildQuoteExport: buildQuoteExport,
    readQuoteExport: readQuoteExport,
    readQuoteExportDetailed: readQuoteExportDetailed,
    validateQuoteFile: validateQuoteFile,
    parseJSONLenient: parseJSONLenient,
    quoteFeedbackPrompt: quoteFeedbackPrompt,
    quoteJsonSchema: QUOTE_JSON_SCHEMA,
    quoteAiInstructions: QUOTE_AI_INSTRUCTIONS,
    quoteFileName: quoteFileName,
    addImportedQuote: addImportedQuote,
    newCatalogItemId: newCatalogItemId,
    catalogItemFromLine: catalogItemFromLine,
    upsertCatalogItem: upsertCatalogItem,
    removeCatalogItem: removeCatalogItem,
    searchCatalog: searchCatalog,
    applyCatalogItemToLine: applyCatalogItemToLine,
    mergeCatalog: mergeCatalog,
  };
});
