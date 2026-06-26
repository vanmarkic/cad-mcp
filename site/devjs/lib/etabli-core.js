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
    // fourniture
    var puv = num(l.pa) * (1 + num(l.marge) / 100);
    var vente = puv * num(l.qte);
    var cout = num(l.pa) * num(l.qte);
    return { cout: cout, vente: vente, puv: puv, qte: num(l.qte), unite: l.unite || "u" };
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
     BIBLIOTHÈQUE DE RÉFÉRENCES — matières & pièces réutilisables.
     But : ne plus ressaisir un panneau ou une pièce d'un devis à l'autre. La
     bibliothèque vit en localStorage ET se pousse vers une branche git dédiée
     (la « base »), via l'API Contents de GitHub (cf. lib/gh-sync.js). Ici :
     uniquement la logique PURE (forme de la base, fusion, dédoublonnage) — sans
     DOM ni réseau —, testée et partagée avec le navigateur.

     Une « matière » de bibliothèque reprend les champs du calepinage
     (material, panelW, panelH, kerf, pricePerM2, grainDirection) ; une « pièce »
     reprend (label, w, h, qty). L'id est DÉTERMINISTE (dérivé du contenu) : deux
     postes qui enregistrent la même matière obtiennent le même id → la fusion
     les dédoublonne d'office, et « ré-enregistrer » met simplement à jour la date.
     ========================================================================= */
  var REFS_VERSION = 1;

  function str(v) { return v == null ? "" : String(v); }

  function emptyRefsDB() {
    return { version: REFS_VERSION, materials: [], pieces: [], updatedAt: null };
  }

  // signature de contenu (sert d'id stable et de clé de dédoublonnage)
  function materialSignature(m) {
    return "m-" + [
      str(m.material).trim().toLowerCase(),
      num(m.panelW), num(m.panelH), num(m.kerf), num(m.pricePerM2),
      m.grainDirection ? 1 : 0,
    ].join("|");
  }
  function pieceSignature(p) {
    return "p-" + [
      str(p.label).trim().toLowerCase(), num(p.w), num(p.h), num(p.qty),
    ].join("|");
  }

  // extraction d'une référence depuis une matière / pièce du calepinage
  function makeMaterialRef(m, now, id) {
    m = m || {};
    return {
      id: id || materialSignature(m),
      material: str(m.material),
      panelW: str(m.panelW), panelH: str(m.panelH),
      kerf: str(m.kerf), pricePerM2: str(m.pricePerM2),
      grainDirection: !!m.grainDirection,
      updatedAt: now || null,
    };
  }
  function makePieceRef(p, now, id) {
    p = p || {};
    // on normalise la quantité (vide → 1) AVANT d'en dériver l'id, pour que la
    // signature reflète exactement les champs stockés (id ⇆ contenu cohérents).
    var qty = str(p.qty === "" || p.qty == null ? "1" : p.qty);
    var norm = { label: p.label, w: p.w, h: p.h, qty: qty };
    return {
      id: id || pieceSignature(norm),
      label: str(p.label),
      w: str(p.w), h: str(p.h), qty: qty,
      updatedAt: now || null,
    };
  }

  // upsert/suppression par id (immuables)
  function upsertRef(list, ref) {
    var out = [], replaced = false;
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].id === ref.id) { out.push(ref); replaced = true; }
      else out.push(list[i]);
    }
    if (!replaced) out.push(ref);
    return out;
  }
  function removeRef(list, id) {
    var out = [];
    for (var i = 0; i < (list || []).length; i++) if (list[i].id !== id) out.push(list[i]);
    return out;
  }

  // union par id ; à id égal, le updatedAt le plus récent gagne ; tri récent→ancien.
  function mergeRefLists(a, b) {
    var byId = {};
    function add(r) {
      if (!r || !r.id) return;
      var ex = byId[r.id];
      if (!ex || str(r.updatedAt) > str(ex.updatedAt)) byId[r.id] = r;
    }
    (a || []).forEach(add);
    (b || []).forEach(add);
    return Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (x, y) { return str(y.updatedAt).localeCompare(str(x.updatedAt)); });
  }

  // normalise une base potentiellement abîmée (lue du disque ou du distant)
  function validateRefsDB(obj) {
    var db = emptyRefsDB();
    if (!obj || typeof obj !== "object") return db;
    if (Array.isArray(obj.materials)) {
      db.materials = obj.materials
        .filter(function (m) { return m && typeof m === "object"; })
        .map(function (m) { return makeMaterialRef(m, m.updatedAt || null, m.id); });
    }
    if (Array.isArray(obj.pieces)) {
      db.pieces = obj.pieces
        .filter(function (p) { return p && typeof p === "object"; })
        .map(function (p) { return makePieceRef(p, p.updatedAt || null, p.id); });
    }
    db.updatedAt = obj.updatedAt || null;
    return db;
  }

  // fusionne deux bases (distante + locale) — base de la synchro git.
  function mergeRefsDB(a, b, now) {
    var na = validateRefsDB(a), nb = validateRefsDB(b);
    return {
      version: REFS_VERSION,
      materials: mergeRefLists(na.materials, nb.materials),
      pieces: mergeRefLists(na.pieces, nb.pieces),
      updatedAt: now || na.updatedAt || nb.updatedAt || null,
    };
  }

  return {
    num: num,
    computeLine: computeLine,
    tvaBreakdown: tvaBreakdown,
    calculateCutlist: calculateCutlist,
    panelMetrics: panelMetrics,
    cutListText: cutListText,
    expandPieces: expandPieces,
    // bibliothèque de références
    emptyRefsDB: emptyRefsDB,
    materialSignature: materialSignature,
    pieceSignature: pieceSignature,
    makeMaterialRef: makeMaterialRef,
    makePieceRef: makePieceRef,
    upsertRef: upsertRef,
    removeRef: removeRef,
    mergeRefLists: mergeRefLists,
    validateRefsDB: validateRefsDB,
    mergeRefsDB: mergeRefsDB,
  };
});
