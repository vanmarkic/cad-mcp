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

  // Emballe UN devis. `_savedAt` (horodatage local de « Enregistrer ») n'est pas
  // exporté ; un devis sans id reçoit un identifiant stable.
  function buildQuoteExport(quote, meta) {
    meta = meta || {};
    var q = cloneJSON(quote || {});
    delete q._savedAt;
    if (q.id == null || q.id === "") q.id = newQuoteId();
    return {
      app: BACKUP_APP,
      kind: QUOTE_FILE_KIND,
      version: BACKUP_VERSION,
      exportedAt: meta.exportedAt != null ? meta.exportedAt : null,
      data: { quotes: [q] },
    };
  }

  // Nom de fichier : etabli-devis-<numéro>-<date>.json (numéro nettoyé : sans accents
  // ni caractères interdits dans un nom de fichier).
  function quoteFileName(quote, dateISO) {
    var n = strOf(quote && quote.numero).trim();
    if (n.normalize) n = n.normalize("NFD").replace(/[̀-ͯ]/g, "");
    n = n.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return "etabli-devis-" + (n || "sans-numero") + (dateISO ? "-" + dateISO : "") + ".json";
  }

  // Valide la STRUCTURE d'un devis venu d'un fichier (pas ses montants) pour qu'il
  // ne puisse pas faire planter l'appli au chargement : client objet, lignes
  // objets de type connu, identifiants présents et uniques. Un devis bien formé
  // (celui que produit l'export) ressort identique.
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

  // Lit un fichier d'export d'UN devis (chaîne JSON ou objet) → le devis normalisé.
  // Erreurs explicites : JSON invalide, autre appli, sauvegarde complète, devis abîmé.
  function readQuoteExport(input) {
    var obj;
    if (typeof input === "string") {
      try { obj = JSON.parse(input); }
      catch (e) { throw new Error("Fichier illisible (JSON invalide)."); }
    } else {
      obj = input;
    }
    if (!isPlainObject(obj) || obj.app !== BACKUP_APP || !isPlainObject(obj.data)) {
      throw new Error("Ce fichier n'est pas un devis Établi.");
    }
    if (obj.kind !== QUOTE_FILE_KIND) {
      throw new Error("C'est une sauvegarde complète, pas un devis seul : utilise Réglages → « Restaurer… ».");
    }
    var list = obj.data.quotes;
    if (!Array.isArray(list) || list.length !== 1) {
      throw new Error("Fichier de devis invalide (un seul devis attendu).");
    }
    return normalizeQuote(list[0]);
  }

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
