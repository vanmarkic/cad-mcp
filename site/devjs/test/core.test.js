"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../lib/etabli-core.js");

/* ---------------------------------------------------------------- num() */
test("num: parses fr-formatted numbers, spaces and commas", () => {
  assert.equal(C.num("30"), 30);
  assert.equal(C.num("30,5"), 30.5);
  assert.equal(C.num("1 234,5"), 1234.5);
  assert.equal(C.num(42), 42);
  assert.equal(C.num(""), 0);
  assert.equal(C.num(null), 0);
  assert.equal(C.num(undefined), 0);
  assert.equal(C.num("abc"), 0);
  assert.equal(C.num(NaN), 0);
  assert.equal(C.num(Infinity), 0);
});

/* -------------------------------------------------- computeLine() : marge */
test("computeLine fourniture: marge is a markup on purchase price", () => {
  const r = C.computeLine({ type: "fourniture", pa: "200", marge: "30", qte: "1", unite: "u" });
  assert.equal(r.cout, 200);
  assert.equal(r.puv, 260); // 200 * 1.30
  assert.equal(r.vente, 260);
  assert.equal(r.qte, 1);
  assert.equal(r.unite, "u");
});

test("computeLine fourniture: returns NUMERIC qte (regression for input clobber)", () => {
  // The UI bug came from spreading these computed fields back over the raw
  // string inputs. computeLine must keep returning numbers so the UI can map
  // them onto DISTINCT keys (qteNum/uniteOut/margeEur) — never onto qte/marge.
  const r = C.computeLine({ type: "fourniture", pa: "10", marge: "50", qte: "3", unite: "m²" });
  assert.equal(typeof r.qte, "number");
  assert.equal(r.qte, 3);
  assert.equal(r.unite, "m²");
  assert.equal(r.cout, 30);
  assert.equal(r.vente, 45); // 10*1.5*3
});

test("computeLine main: hours × rates", () => {
  const r = C.computeLine({ type: "main", heures: "10", tauxVente: "55", coutHoraire: "35" });
  assert.equal(r.cout, 350);
  assert.equal(r.vente, 550);
  assert.equal(r.puv, 55);
  assert.equal(r.qte, 10);
  assert.equal(r.unite, "h");
});

test("computeLine forfait: pa with markup, qte 1", () => {
  const r = C.computeLine({ type: "forfait", pa: "1000", marge: "20" });
  assert.equal(r.cout, 1000);
  assert.equal(r.vente, 1200);
  assert.equal(r.qte, 1);
});

test("computeLine: empty marge means 0% markup, not NaN", () => {
  const r = C.computeLine({ type: "fourniture", pa: "100", marge: "", qte: "2", unite: "u" });
  assert.equal(r.puv, 100);
  assert.equal(r.vente, 200);
});

/* -------------------------------------------------- tvaBreakdown() */
test("tvaBreakdown: taux unique → un seul groupe", () => {
  const r = C.tvaBreakdown([{ vente: 1000, rate: 6 }, { vente: 500, rate: 6 }], {});
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].rate, 6);
  assert.equal(r.groups[0].base, 1500);
  assert.ok(Math.abs(r.groups[0].tva - 90) < 1e-9); // 1500 × 6 %
  assert.equal(r.baseHT, 1500);
  assert.ok(Math.abs(r.tva - 90) < 1e-9);
  assert.ok(Math.abs(r.ttc - 1590) < 1e-9);
});

test("tvaBreakdown: fournitures 21 % + reste 6 % → deux groupes (trié décroissant)", () => {
  // l'exemple de Jérémie : 6 % sur la facture finale, 21 % sur les fournitures.
  const r = C.tvaBreakdown([{ vente: 1000, rate: 6 }, { vente: 500, rate: 21 }], {});
  assert.equal(r.groups.length, 2);
  assert.equal(r.groups[0].rate, 21); // taux le plus haut en premier
  assert.equal(r.groups[1].rate, 6);
  assert.ok(Math.abs(r.groups[0].tva - 105) < 1e-9); // 500 × 21 %
  assert.ok(Math.abs(r.groups[1].tva - 60) < 1e-9);  // 1000 × 6 %
  assert.equal(r.baseHT, 1500);
  assert.ok(Math.abs(r.tva - 165) < 1e-9);
  assert.ok(Math.abs(r.ttc - 1665) < 1e-9);
});

test("tvaBreakdown: la remise est répartie au prorata du HT par taux", () => {
  const r = C.tvaBreakdown(
    [{ vente: 1000, rate: 6 }, { vente: 1000, rate: 21 }],
    { remise: 200 } // venteHT 2000 → facteur 0,9 → chaque base ×0,9
  );
  assert.equal(r.baseHT, 1800);
  assert.ok(Math.abs(r.groups[0].base - 900) < 1e-9); // 21 %
  assert.ok(Math.abs(r.groups[1].base - 900) < 1e-9); // 6 %
  assert.ok(Math.abs(r.tva - (900 * 0.21 + 900 * 0.06)) < 1e-9); // 243
  assert.ok(Math.abs(r.ttc - 2043) < 1e-9);
});

test("tvaBreakdown: le déplacement est facturé à son propre taux", () => {
  const r = C.tvaBreakdown(
    [{ vente: 1000, rate: 21 }],
    { deplacement: 100, deplacementRate: 6 }
  );
  assert.equal(r.groups.length, 2);
  const g6 = r.groups.find((g) => g.rate === 6);
  const g21 = r.groups.find((g) => g.rate === 21);
  assert.equal(g6.base, 100);
  assert.equal(g21.base, 1000);
  assert.ok(Math.abs(r.tva - (1000 * 0.21 + 100 * 0.06)) < 1e-9); // 216
});

test("tvaBreakdown: cocontractant (taux 0) → aucune TVA", () => {
  const r = C.tvaBreakdown([{ vente: 1000, rate: 0 }, { vente: 500, rate: 0 }], {});
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].rate, 0);
  assert.equal(r.tva, 0);
  assert.equal(r.ttc, 1500);
});

test("tvaBreakdown: devis vide → pas de groupe, totaux à 0", () => {
  const r = C.tvaBreakdown([], {});
  assert.equal(r.groups.length, 0);
  assert.equal(r.baseHT, 0);
  assert.equal(r.tva, 0);
  assert.equal(r.ttc, 0);
});

/* -------------------------------------------------- calculateCutlist() */
const CFG = (over) => Object.assign({ width: 2500, height: 1250, kerf: 3, grainDirection: false, oversizeTolerance: 0 }, over || {});

test("cutlist: one piece smaller than the panel → exactly 1 panel", () => {
  const res = C.calculateCutlist([{ id: "a", label: "Porte", width: 600, height: 400, quantity: 1, color: "#aaa" }], CFG());
  assert.equal(res.totalSheets, 1);
  assert.equal(res.unfitPieces.length, 0);
  assert.equal(res.sheets[0].pieces.length, 1);
});

test("cutlist: four full-panel pieces → 4 panels", () => {
  const res = C.calculateCutlist([{ id: "a", label: "Plein", width: 2500, height: 1250, quantity: 4, color: "#aaa" }], CFG());
  assert.equal(res.totalSheets, 4);
  assert.equal(res.unfitPieces.length, 0);
});

test("cutlist: piece larger than the panel is unfit, no panel used", () => {
  const res = C.calculateCutlist([{ id: "x", label: "Trop grand", width: 3000, height: 1250, quantity: 1, color: "#aaa" }], CFG());
  assert.equal(res.totalSheets, 0);
  assert.equal(res.unfitPieces.length, 1);
  assert.equal(res.unfitPieces[0].id, "x");
});

test("cutlist: rotation lets a piece fit only when unlocked", () => {
  // 1240 × 2000 in a 2500×1250 panel:
  // normal: 1240<=2500, 2000>1250 → NO. rotated: 2000<=2500, 1240<=1250 → YES.
  const piece = { id: "r", label: "Rotatif", width: 1240, height: 2000, quantity: 1, color: "#aaa" };
  const free = C.calculateCutlist([piece], CFG({ grainDirection: false }));
  assert.equal(free.unfitPieces.length, 0);
  assert.equal(free.sheets[0].pieces[0].rotated, true);
  const locked = C.calculateCutlist([piece], CFG({ grainDirection: true }));
  assert.equal(locked.unfitPieces.length, 1);
});

test("cutlist: kerf consumes space so 2 pieces no longer fit one strip", () => {
  // panel 1000×100, kerf 10. Two pieces 495×100: 495 + 10(kerf) + 495 = 1000 → fits.
  // Two pieces 500×100: 500 + 10 + 500 = 1010 > 1000 → needs 2 panels.
  const fit = C.calculateCutlist(
    [{ id: "a", label: "A", width: 495, height: 100, quantity: 2, color: "#aaa" }],
    CFG({ width: 1000, height: 100, kerf: 10 })
  );
  assert.equal(fit.totalSheets, 1);
  const split = C.calculateCutlist(
    [{ id: "b", label: "B", width: 500, height: 100, quantity: 2, color: "#aaa" }],
    CFG({ width: 1000, height: 100, kerf: 10 })
  );
  assert.equal(split.totalSheets, 2);
});

test("cutlist: empty piece list → 0 panels, no error", () => {
  const res = C.calculateCutlist([], CFG());
  assert.equal(res.totalSheets, 0);
  assert.equal(res.unfitPieces.length, 0);
});

test("cutlist: invalid panel dimensions → everything unfit", () => {
  const res = C.calculateCutlist([{ id: "a", label: "A", width: 100, height: 100, quantity: 1, color: "#aaa" }], CFG({ width: 0 }));
  assert.equal(res.totalSheets, 0);
  assert.equal(res.unfitPieces.length, 1);
});

test("cutlist: waste percent is sane (0..100) and lower with better fit", () => {
  // kerf 0 so two 1250×1250 fit exactly side by side in 2500×1250.
  const res = C.calculateCutlist([{ id: "a", label: "A", width: 1250, height: 1250, quantity: 2, color: "#aaa" }], CFG({ kerf: 0 }));
  assert.equal(res.totalSheets, 1);
  assert.ok(res.totalWastePercent >= 0 && res.totalWastePercent < 60);
});

/* -------------------------------------------------- panelMetrics() */
test("panelMetrics: whole-panel cost from €/m² (mm default)", () => {
  const res = { totalSheets: 3, totalWastePercent: 12 };
  const m = C.panelMetrics(res, { width: 2500, height: 1250 }, 25); // 3.125 m²/panel
  assert.equal(m.totalSheets, 3);
  assert.ok(Math.abs(m.areaM2PerPanel - 3.125) < 1e-9);
  assert.ok(Math.abs(m.costPerPanel - 78.125) < 1e-9); // 3.125 * 25
  assert.ok(Math.abs(m.totalCost - 234.375) < 1e-9);   // × 3 panels
  assert.equal(m.totalWastePercent, 12);
});

test("panelMetrics: cm unit factor", () => {
  const m = C.panelMetrics({ totalSheets: 1 }, { width: 250, height: 125 }, 25, 0.01); // 3.125 m²
  assert.ok(Math.abs(m.areaM2PerPanel - 3.125) < 1e-9);
});

/* ----- multi-matériaux : plusieurs panneaux/prix dans un même calepinage ----- */
test("multi-matériaux: chaque panneau est chiffré à son propre €/m²", () => {
  // MDF 18 mm à 30 €/m² ET aglo blanc 8 mm à 15 €/m², même cote 2500×1250.
  // On ne mélange pas deux matières sur une plaque : chacune se débite sur ses
  // propres panneaux, donc les coûts sont strictement indépendants.
  const mdf = C.panelMetrics(
    C.calculateCutlist([{ id: "mdf", label: "Côté", width: 600, height: 400, quantity: 4, color: "#a" }], CFG()),
    { width: 2500, height: 1250 }, 30
  );
  const aglo = C.panelMetrics(
    C.calculateCutlist([{ id: "ag", label: "Fond", width: 800, height: 500, quantity: 2, color: "#b" }], CFG()),
    { width: 2500, height: 1250 }, 15
  );
  assert.ok(Math.abs(mdf.costPerPanel - 93.75) < 1e-9);   // 3,125 m² × 30 €/m²
  assert.ok(Math.abs(aglo.costPerPanel - 46.875) < 1e-9); // 3,125 m² × 15 €/m²
  assert.notEqual(mdf.costPerPanel, aglo.costPerPanel);
  // Le coût matière d'un devis multi-matières = somme des coûts par matière.
  const grandCost = mdf.totalCost + aglo.totalCost;
  const expected = mdf.costPerPanel * mdf.totalSheets + aglo.costPerPanel * aglo.totalSheets;
  assert.ok(Math.abs(grandCost - expected) < 1e-9);
});

/* -------------------------------------------------- quote store (Mes devis) */
/* Régression : « établi n'enregistre que le dernier devis, les précédents ont
   disparu ». saveQuote dédoublonnait par `numero`, or chaque nouveau devis
   part du même numéro par défaut ("DEV-YYYY-001") → le 2ᵉ écrasait le 1ᵉʳ.
   La source de vérité de l'identité doit être un `id` stable, pas le numéro
   (que l'utilisateur édite librement et qui peut collisionner). */
test("upsertQuote: deux devis au même numéro par défaut sont TOUS les deux gardés", () => {
  const q1 = { id: "q1", numero: "DEV-2026-001", client: { nom: "Alice" } };
  const q2 = { id: "q2", numero: "DEV-2026-001", client: { nom: "Bob" } };
  let list = C.upsertQuote([], q1);
  list = C.upsertQuote(list, q2);
  assert.equal(list.length, 2, "aucun devis ne doit disparaître");
  assert.deepEqual(list.map((x) => x.id).sort(), ["q1", "q2"]);
});

test("upsertQuote: ré-enregistrer le même devis (même id) met à jour sur place", () => {
  const q = { id: "q1", numero: "DEV-2026-001", client: { nom: "Alice" } };
  let list = C.upsertQuote([], q);
  list = C.upsertQuote(list, { ...q, client: { nom: "Alice B." } });
  assert.equal(list.length, 1);
  assert.equal(list[0].client.nom, "Alice B.");
});

test("upsertQuote: le dernier enregistré passe en tête", () => {
  let list = C.upsertQuote([], { id: "q1", numero: "A" });
  list = C.upsertQuote(list, { id: "q2", numero: "B" });
  assert.equal(list[0].id, "q2");
});

test("upsertQuote: devis hérités sans id → dédoublonnage par numéro (rétro-compat)", () => {
  // liste persistée avant l'introduction des ids.
  let list = [{ numero: "DEV-2026-005", client: { nom: "X" } }];
  list = C.upsertQuote(list, { numero: "DEV-2026-005", client: { nom: "X2" } });
  assert.equal(list.length, 1);
  assert.equal(list[0].client.nom, "X2");
});

test("removeQuote: supprime par id, garde les autres (même numéro)", () => {
  let list = [{ id: "q1", numero: "A" }, { id: "q2", numero: "A" }];
  list = C.removeQuote(list, "q1");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "q2");
});

test("newQuoteId: identifiants uniques", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(C.newQuoteId());
  assert.equal(seen.size, 200, "aucune collision d'id");
});

test("nextQuoteNumero: incrémente le compteur du plus haut numéro de l'année", () => {
  const list = [
    { numero: "DEV-2026-001" },
    { numero: "DEV-2026-004" },
    { numero: "DEV-2025-009" }, // autre année, ignoré
    { numero: "PROJ-X" },       // hors schéma, ignoré
  ];
  assert.equal(C.nextQuoteNumero(list, 2026), "DEV-2026-005");
  assert.equal(C.nextQuoteNumero([], 2026), "DEV-2026-001");
});

/* -------------------------------------------------- catalogue de fournitures */
/* Un catalogue de fournitures réutilisables : on encode une fourniture une fois
   (désignation, prix d'achat, unité, marge, TVA), on la retrouve ensuite par
   auto-complétion ou via la modale « Catalogue ». Logique pure et testée ici. */
test("catalogItemFromLine: extrait les champs réutilisables + id ; null si désignation vide", () => {
  const line = { id: "L1", type: "fourniture", designation: "  Vis 4×40  ", pa: "0,08", unite: "pce", marge: "25", tvaRate: 21, qte: "200", detail: "x" };
  const it = C.catalogItemFromLine(line);
  assert.equal(it.designation, "Vis 4×40"); // trimmé
  assert.equal(it.pa, "0,08");
  assert.equal(it.unite, "pce");
  assert.equal(it.marge, "25");
  assert.equal(it.tvaRate, 21);
  assert.ok(it.id, "un id est attribué");
  assert.equal(C.catalogItemFromLine({ designation: "   " }), null, "désignation vide → null");
});

test("upsertCatalogItem: ajoute, met à jour par désignation (insensible casse/espaces), ignore le vide", () => {
  let cat = C.upsertCatalogItem([], { id: "c1", designation: "MDF 18mm", pa: "30", unite: "m²", marge: "20" });
  assert.equal(cat.length, 1);
  cat = C.upsertCatalogItem(cat, { id: "c2", designation: "  mdf  18MM ", pa: "32", unite: "m²", marge: "18" });
  assert.equal(cat.length, 1, "même article → mise à jour, pas de doublon");
  assert.equal(cat[0].pa, "32");
  const same = C.upsertCatalogItem(cat, { id: "c3", designation: "   " });
  assert.equal(same.length, 1, "désignation vide ignorée");
});

test("removeCatalogItem: supprime par id", () => {
  const out = C.removeCatalogItem([{ id: "c1", designation: "A" }, { id: "c2", designation: "B" }], "c1");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "c2");
});

test("searchCatalog: sous-chaîne insensible à la casse, priorité au préfixe, limite", () => {
  const cat = [
    { id: "1", designation: "Charnière invisible" },
    { id: "2", designation: "Vis à bois 4×40" },
    { id: "3", designation: "Visserie inox" },
    { id: "4", designation: "Colle vinylique" },
  ];
  const r = C.searchCatalog(cat, "vis", 10);
  assert.deepEqual(r.map((x) => x.id), ["2", "3", "1"], "préfixe 'Vis…' avant 'Charnière in-vis-ible'");
  assert.equal(C.searchCatalog(cat, "", 2).length, 2, "requête vide → tout, limité");
});

test("applyCatalogItemToLine: remplit les champs réutilisables, préserve id/type/qté/détail", () => {
  const line = { id: "L1", type: "fourniture", qte: "5", designation: "", pa: "", unite: "u", marge: "", detail: "garde-moi" };
  const item = { id: "c1", designation: "Poignée alu", pa: "6,5", unite: "pce", marge: "30", tvaRate: 21 };
  const out = C.applyCatalogItemToLine(line, item);
  assert.equal(out.id, "L1");
  assert.equal(out.type, "fourniture");
  assert.equal(out.qte, "5");
  assert.equal(out.detail, "garde-moi");
  assert.equal(out.designation, "Poignée alu");
  assert.equal(out.pa, "6,5");
  assert.equal(out.unite, "pce");
  assert.equal(out.marge, "30");
  assert.equal(out.tvaRate, 21);
});

test("mergeCatalog: union par désignation, sans perte", () => {
  const cur = [{ id: "c1", designation: "MDF 18mm", pa: "30" }];
  const inc = [{ id: "c9", designation: "mdf 18MM", pa: "31" }, { id: "c2", designation: "Chêne", pa: "90" }];
  const m = C.mergeCatalog(cur, inc);
  assert.equal(m.length, 2);
  const byd = Object.fromEntries(m.map((x) => [x.designation.toLowerCase(), x.pa]));
  assert.equal(byd["mdf 18mm"], "31"); // l'entrant écrase
  assert.equal(byd["chêne"], "90");
});

test("buildBackup/readBackup: le catalogue est inclus et relu (rétro-compat : absent → [])", () => {
  const b = C.buildBackup({ catalogue: [{ id: "c1", designation: "MDF" }] }, {});
  assert.deepEqual(b.data.catalogue, [{ id: "c1", designation: "MDF" }]);
  assert.deepEqual(C.readBackup(b).catalogue, [{ id: "c1", designation: "MDF" }]);
  assert.deepEqual(C.readBackup({ app: "etabli", data: { quotes: [] } }).catalogue, [], "vieux fichier sans catalogue");
});

/* -------------------------------------------------- sauvegarde / restauration */
/* Un seul fichier .json regroupe TOUTES les données utilisateur (réglages +
   devis + calepinage), pour sauver et restaurer d'un navigateur/poste à l'autre.
   Les fonctions du noyau sont pures : elles ne touchent ni au DOM ni au disque
   (l'UI s'occupe du téléchargement / FileReader). */
test("buildBackup: emballe les données avec app + version + normalise les sections", () => {
  const b = C.buildBackup(
    { settings: { company: { nom: "Atelier" }, params: { tvaRate: 6 } }, quotes: [{ id: "q1" }], calepinage: { materials: [] } },
    { exportedAt: "2026-07-09T10:00:00.000Z" }
  );
  assert.equal(b.app, "etabli");
  assert.ok(typeof b.version === "number");
  assert.equal(b.exportedAt, "2026-07-09T10:00:00.000Z");
  assert.deepEqual(b.data.quotes, [{ id: "q1" }]);
  assert.equal(b.data.settings.company.nom, "Atelier");
  assert.deepEqual(b.data.calepinage, { materials: [] });
});

test("buildBackup: sections manquantes → quotes [] et null ailleurs", () => {
  const b = C.buildBackup({}, {});
  assert.deepEqual(b.data.quotes, []);
  assert.equal(b.data.settings, null);
  assert.equal(b.data.calepinage, null);
});

test("readBackup: relit une chaîne JSON et rend les trois sections", () => {
  const text = JSON.stringify(C.buildBackup({ quotes: [{ id: "q1", numero: "A" }] }, {}));
  const r = C.readBackup(text);
  assert.deepEqual(r.quotes, [{ id: "q1", numero: "A" }]);
  assert.equal(r.settings, null);
  assert.equal(r.calepinage, null);
});

test("readBackup: aller-retour avec buildBackup (accepte aussi un objet)", () => {
  const data = { settings: { company: { nom: "X" }, params: { acompte: 30 } }, quotes: [{ id: "q1" }], calepinage: { activeId: null } };
  const r = C.readBackup(C.buildBackup(data, {}));
  assert.deepEqual(r.quotes, data.quotes);
  assert.equal(r.settings.company.nom, "X");
  assert.deepEqual(r.calepinage, { activeId: null });
});

test("readBackup: JSON invalide → erreur explicite", () => {
  assert.throws(() => C.readBackup("{pas du json"), /illisible|JSON/i);
});

test("readBackup: fichier étranger (mauvaise app) → refus", () => {
  assert.throws(() => C.readBackup(JSON.stringify({ app: "autre", data: {} })), /sauvegarde/i);
});

test("mergeQuotes: union par id, l'entrant prime, rien n'est perdu", () => {
  const current = [{ id: "q1", client: { nom: "Alice" } }, { id: "q2", client: { nom: "Bob" } }];
  const incoming = [{ id: "q1", client: { nom: "Alice (sauvegarde)" } }, { id: "q3", client: { nom: "Carol" } }];
  const merged = C.mergeQuotes(current, incoming);
  assert.equal(merged.length, 3, "q1 fusionné, q2 gardé, q3 ajouté");
  const byId = Object.fromEntries(merged.map((q) => [q.id, q.client.nom]));
  assert.equal(byId.q1, "Alice (sauvegarde)"); // l'entrant écrase
  assert.equal(byId.q2, "Bob");                 // l'existant survit
  assert.equal(byId.q3, "Carol");               // l'entrant s'ajoute
});

test("mergeQuotes: devis hérités sans id fusionnés par numéro", () => {
  const merged = C.mergeQuotes([{ numero: "DEV-2026-001", client: { nom: "X" } }], [{ numero: "DEV-2026-001", client: { nom: "X2" } }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].client.nom, "X2");
});

/* -------------------------------------------------- cutListText() */
test("cutListText: groups identical pieces and counts totals", () => {
  const out = C.cutListText([
    { label: "Étagère", width: 600, height: 300, quantity: 4 },
    { label: "Étagère", width: 600, height: 300, quantity: 2 }, // merges → 6
    { label: "Montant", width: 1800, height: 300, quantity: 2 },
    { label: "Vide", width: 0, height: 300, quantity: 5 }, // skipped
  ]);
  assert.equal(out.distinct, 2);
  assert.equal(out.totalPieces, 8);
  const lines = out.text.split("\n");
  assert.match(lines[0], /Qté/);
  assert.match(out.text, /6\tÉtagère\t600\t300/);
  assert.match(out.text, /2\tMontant\t1800\t300/);
  assert.doesNotMatch(out.text, /Vide/);
});

/* =========================================================================
   TEXTE ENRICHI — gras / italique / souligné / listes (parseRichText)
   ========================================================================= */
const runsOf = (text) => C.parseRichText(text)[0].runs.map((r) => [r.text, r.b ? "b" : "", r.i ? "i" : "", r.u ? "u" : ""].join("|"));

test("parseRichText: gras, italique, souligné", () => {
  assert.deepEqual(runsOf("un **gras** et *ital* et __sou__ fin"), [
    "un ||||", "gras|b||", " et ||||", "ital||i|", " et ||||", "sou|||u", " fin||||",
  ].map((x) => x.replace(/\|{4}$/, "|||")));
});

test("parseRichText: mises en forme combinées et imbriquées", () => {
  assert.deepEqual(runsOf("***gras italique***"), ["gras italique|b|i|"]);
  assert.deepEqual(runsOf("*a **b** c*"), ["a ||i|", "b|b|i|", " c||i|"]);
  assert.deepEqual(runsOf("**a *b* c**"), ["a |b||", "b|b|i|", " c|b||"]);
});

test("parseRichText: texte courant intact (3*4, 2 * 3, réf_12_B, marque non fermée)", () => {
  for (const t of ["3*4 et 5*6", "2 * 3 = 6", "réf_12_B et snake__case__x", "**jamais fermé", "un * seul", "étoile * et *autre"]) {
    const blocks = C.parseRichText(t);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].runs.length, 1, "un seul segment brut pour : " + t);
    assert.equal(blocks[0].runs[0].text, t);
    assert.equal(C.hasRichFormatting(t), false);
  }
});

test("parseRichText: \\* et \\_ affichent le caractère tel quel", () => {
  assert.deepEqual(runsOf("2\\*3\\*4 et \\_x\\_"), ["2*3*4 et _x_|||"]);
  assert.deepEqual(runsOf("\\*pas italique\\*"), ["*pas italique*|||"]);
});

test("parseRichText: listes à puces / numérotées, paragraphes conservés", () => {
  const b = C.parseRichText("Intro\nsuite\n- un\n- **deux**\n• trois\nFin\n3. x\n4) y");
  assert.deepEqual(b.map((x) => x.type), ["p", "ul", "p", "ol"]);
  assert.equal(b[0].runs[0].text, "Intro\nsuite", "les retours à la ligne d'un paragraphe sont gardés");
  assert.equal(b[1].items.length, 3);
  assert.equal(b[1].items[1][0].b, true);
  assert.equal(b[3].start, 3, "la numérotation démarre au 1er numéro saisi");
  assert.equal(b[3].items.length, 2);
});

test("parseRichText: vide, espaces, CRLF et lignes vides en bord", () => {
  assert.deepEqual(C.parseRichText(""), []);
  assert.deepEqual(C.parseRichText(null), []);
  assert.deepEqual(C.parseRichText("  \n \n"), []);
  const b = C.parseRichText("\n\nA\r\n\r\nB\n\n");
  assert.equal(b.length, 1);
  assert.equal(b[0].runs[0].text, "A\n\nB");
});

test("parseRichText: les ligne de métré générées (tabulations, ×) ne sont pas prises pour une liste", () => {
  const detail = "3 panneau(x) 2500×1250 mm — chute 12 %\nQté\tDésignation\tLongueur (mm)\tLargeur (mm)\n10\tÉtagère\t600\t400";
  const b = C.parseRichText(detail);
  assert.equal(b.length, 1);
  assert.equal(b[0].type, "p");
  assert.equal(b[0].runs[0].text, detail);
  assert.equal(C.hasRichFormatting(detail), false);
});

test("hasRichFormatting: vrai dès qu'il y a du gras / une liste", () => {
  assert.equal(C.hasRichFormatting("texte **gras**"), true);
  assert.equal(C.hasRichFormatting("- puce"), true);
  assert.equal(C.hasRichFormatting("1. numéro"), true);
  assert.equal(C.hasRichFormatting("simple"), false);
});

test("parseRichText: le HTML saisi reste du texte (pas d'injection)", () => {
  const b = C.parseRichText("<script>alert(1)</script> **<b>x</b>**");
  assert.equal(b[0].runs[0].text, "<script>alert(1)</script> ");
  assert.equal(b[0].runs[1].text, "<b>x</b>");
  assert.equal(b[0].runs[1].b, true);
});

/* ---------- barre d'outils : applyTextFormat ---------- */
const fmt = (text, s, e, kind) => C.applyTextFormat(text, s, e, kind);
const picked = (r) => r.text.slice(r.start, r.end);

test("applyTextFormat: gras sur une sélection, puis une 2ᵉ fois le retire", () => {
  const r1 = fmt("bonjour le monde", 8, 10, "bold");
  assert.equal(r1.text, "bonjour **le** monde");
  assert.equal(picked(r1), "le", "la sélection est conservée sur le mot");
  const r2 = fmt(r1.text, r1.start, r1.end, "bold");
  assert.equal(r2.text, "bonjour le monde");
  assert.equal(picked(r2), "le");
});

test("applyTextFormat: retire aussi quand la sélection englobe les marques", () => {
  const r = fmt("a **gras** b", 2, 10, "bold");
  assert.equal(r.text, "a gras b");
  assert.equal(picked(r), "gras");
});

test("applyTextFormat: italique, souligné et combinaisons bascule indépendamment", () => {
  let r = fmt("mot", 0, 3, "italic");
  assert.equal(r.text, "*mot*");
  r = fmt(r.text, r.start, r.end, "bold");
  assert.equal(r.text, "***mot***");
  r = fmt(r.text, r.start, r.end, "italic"); // retire l'italique, garde le gras
  assert.equal(r.text, "**mot**");
  r = fmt(r.text, r.start, r.end, "underline");
  assert.equal(r.text, "**__mot__**");
  r = fmt(r.text, r.start, r.end, "bold");   // retire le gras à travers le souligné, qui reste
  assert.equal(r.text, "__mot__");
  assert.equal(picked(r), "mot");
  r = fmt(r.text, r.start, r.end, "underline");
  assert.equal(r.text, "mot");
});

test("applyTextFormat: les espaces de bord de la sélection restent hors des marques", () => {
  const r = fmt("  mot  ", 0, 7, "bold");
  assert.equal(r.text, "  **mot**  ");
  // résultat rendu comme du gras
  assert.equal(C.parseRichText(r.text)[0].runs.find((x) => x.b).text, "mot");
});

test("applyTextFormat: sans sélection, insère une paire (curseur au milieu) puis la retire", () => {
  const r1 = fmt("ab", 1, 1, "bold");
  assert.equal(r1.text, "a****b");
  assert.equal(r1.start, 3);
  assert.equal(r1.end, 3);
  const r2 = fmt(r1.text, r1.start, r1.end, "bold");
  assert.equal(r2.text, "ab");
  assert.equal(r2.start, 1);
});

test("applyTextFormat: sélection multi-lignes → chaque ligne est formatée, retirée d'un coup", () => {
  const r = fmt("l1\nl2\nl3", 0, 8, "bold");
  assert.equal(r.text, "**l1**\n**l2**\n**l3**");
  const back = fmt(r.text, r.start, r.end, "bold");
  assert.equal(back.text, "l1\nl2\nl3");
  // si une seule ligne était déjà en gras, on met les autres en gras (pas d'inversion)
  const mixed = fmt("**a**\nb", 0, 8, "bold");
  assert.equal(mixed.text, "**a**\n**b**");
});

test("applyTextFormat: listes — ajout, retrait, conversion puces ⇄ numérotée", () => {
  let r = fmt("a\nb\n\nc", 0, 6, "ul");
  assert.equal(r.text, "- a\n- b\n\n- c", "les lignes vides sont ignorées");
  r = fmt(r.text, r.start, r.end, "ul");
  assert.equal(r.text, "a\nb\n\nc", "2ᵉ clic = retrait");
  r = fmt("a\nb", 0, 3, "ol");
  assert.equal(r.text, "1. a\n2. b");
  r = fmt(r.text, r.start, r.end, "ul");
  assert.equal(r.text, "- a\n- b", "numérotée → puces");
  r = fmt(r.text, r.start, r.end, "ol");
  assert.equal(r.text, "1. a\n2. b", "puces → numérotée");
});

test("applyTextFormat: liste sans sélection (ligne du curseur) et ligne vide", () => {
  let r = fmt("un\ndeux\ntrois", 5, 5, "ul");
  assert.equal(r.text, "un\n- deux\ntrois");
  assert.equal(r.start, 7, "le curseur suit le décalage du préfixe");
  r = fmt("", 0, 0, "ul");
  assert.equal(r.text, "- ");
  assert.equal(r.start, 2);
  r = fmt("a\n\nb", 2, 2, "ol");
  assert.equal(r.text, "a\n1. \nb");
});

test("applyTextFormat: type inconnu / bornes hors texte → inchangé, sans exception", () => {
  assert.deepEqual(fmt("abc", 1, 2, "nope"), { text: "abc", start: 1, end: 2 });
  const r = fmt("abc", -5, 99, "bold");
  assert.equal(r.text, "**abc**");
  const sw = fmt("abc", 3, 0, "italic"); // bornes inversées
  assert.equal(sw.text, "*abc*");
});

test("applyTextFormat: gras appliqué = vraiment rendu en gras (aller-retour avec le parseur)", () => {
  const r = fmt("pose incluse", 5, 12, "bold");
  const runs = C.parseRichText(r.text)[0].runs;
  assert.deepEqual(runs.map((x) => [x.text, x.b]), [["pose ", false], ["incluse", true]]);
});

/* =========================================================================
   MÈTRE LINÉAIRE — fournitures (linearLineQty / computeLine)
   ========================================================================= */
test("linearTotal: somme longueur × quantité selon l'unité (m, cm, mm)", () => {
  const items = [{ len: "2,4", qty: "3" }, { len: "1,2", qty: "2" }];
  assert.ok(Math.abs(C.linearTotal(items, "m").totalM - 9.6) < 1e-9);
  assert.ok(Math.abs(C.linearTotal([{ len: "240", qty: "3" }, { len: "120", qty: "2" }], "cm").totalM - 9.6) < 1e-9);
  assert.ok(Math.abs(C.linearTotal([{ len: "2400", qty: "3" }], "mm").totalM - 7.2) < 1e-9);
  const t = C.linearTotal(items, "m");
  assert.equal(t.pieces, 5);
  assert.equal(t.distinct, 2);
});

test("linearTotal: lignes vides / quantité nulle ignorées, unité inconnue = mètres", () => {
  const t = C.linearTotal([{ len: "", qty: "2" }, { len: "3", qty: "0" }, { len: "3", qty: "" }, { len: "1,5", qty: "2" }], "zzz");
  assert.equal(t.totalM, 3);
  assert.equal(t.pieces, 2);
  assert.equal(C.linearTotal(undefined, "m").totalM, 0);
});

test("linearLineQty: la chute majore la quantité, sans bruit de virgule flottante", () => {
  const r = C.linearLineQty({ mlItems: [{ len: "2,4", qty: "3" }, { len: "1,2", qty: "2" }], mlUnit: "m", mlPerte: "10" });
  assert.equal(r.totalM, 9.6);
  assert.equal(r.qteM, 10.56);
  assert.equal(r.perte, 10);
  assert.equal(C.linearLineQty({ mlItems: [{ len: "2,4", qty: "3" }], mlUnit: "m", mlPerte: "" }).qteM, 7.2);
  assert.equal(C.linearLineQty({ mlItems: [{ len: "1", qty: "1" }], mlPerte: "-50" }).qteM, 1, "une chute négative est ignorée");
});

test("computeLine fourniture au ml: la quantité découle des longueurs, l'unité est ml", () => {
  const r = C.computeLine({
    type: "fourniture", mlOn: true, mlItems: [{ len: "2400", qty: "3" }], mlUnit: "mm", mlPerte: "",
    pa: "4,2", marge: "30", qte: "99", unite: "u",
  });
  assert.equal(r.unite, "ml");
  assert.equal(r.qte, 7.2, "la qte saisie (99) est ignorée en mode ml");
  assert.ok(Math.abs(r.cout - 4.2 * 7.2) < 1e-9);
  assert.ok(Math.abs(r.puv - 4.2 * 1.3) < 1e-9);
  assert.ok(Math.abs(r.vente - 4.2 * 1.3 * 7.2) < 1e-9);
});

test("computeLine: mlOn absent/false → comportement inchangé (devis existants)", () => {
  const base = { type: "fourniture", pa: "10", marge: "50", qte: "3", unite: "m²" };
  const a = C.computeLine(base);
  const b = C.computeLine({ ...base, mlOn: false, mlItems: [{ len: "9", qty: "9" }] });
  assert.deepEqual(a, b);
  assert.equal(a.qte, 3);
  assert.equal(a.unite, "m²");
});

test("linearDetailText: détail de métré prêt pour le texte enrichi (puces + total)", () => {
  const t = C.linearDetailText({ mlItems: [{ len: "2,4", qty: "3" }, { len: "1,2", qty: "2" }, { len: "", qty: "1" }], mlUnit: "m", mlPerte: "10" });
  assert.equal(t, "Longueurs :\n- 3 × 2,4 m\n- 2 × 1,2 m\nTotal : 9,6 ml + 10 % de chute = 10,56 ml");
  assert.equal(C.parseRichText(t)[1].type, "ul", "les longueurs s'affichent en puces sur le devis");
  assert.equal(C.linearDetailText({ mlItems: [] }), "");
});

/* =========================================================================
   MÈTRE LINÉAIRE — calepinage 1D (calculateLinearCutlist / linearMetrics)
   ========================================================================= */
const LP = (length, quantity, id) => ({ id: id || "p" + length, label: "p" + length, length, quantity });

test("calculateLinearCutlist: une pièce par barre quand deux ne tiennent pas ensemble", () => {
  // 4 × 1300 sur barres de 2400 : 2600 > 2400 → une pièce par barre → 4 barres (pas ⌈5200/2400⌉ = 3)
  const r = C.calculateLinearCutlist([LP(1300, 4)], { barLength: 2400, kerf: 3 });
  assert.equal(r.totalBars, 4);
  assert.equal(r.unfitPieces.length, 0);
  assert.equal(r.usedLength, 5200);
  assert.ok(Math.abs(r.totalWastePercent - (1 - 5200 / 9600) * 100) < 1e-9);
});

test("calculateLinearCutlist: le trait de scie compte entre deux pièces", () => {
  // 2 × 1200 : 1200 + 3 + 1200 = 2403 > 2400 → 2 barres ; sans trait de scie → 1
  assert.equal(C.calculateLinearCutlist([LP(1200, 2)], { barLength: 2400, kerf: 3 }).totalBars, 2);
  assert.equal(C.calculateLinearCutlist([LP(1200, 2)], { barLength: 2400, kerf: 0 }).totalBars, 1);
  // 1200 + 1197 + 3 de trait = 2400 pile → tient
  const fit = C.calculateLinearCutlist([LP(1200, 1, "a"), LP(1197, 1, "b")], { barLength: 2400, kerf: 3 });
  assert.equal(fit.totalBars, 1);
  assert.deepEqual(fit.bars[0].pieces.map((p) => [p.x, p.length]), [[0, 1200], [1203, 1197]]);
});

test("calculateLinearCutlist: pièce = barre entière → aucun trait de scie nécessaire", () => {
  const r = C.calculateLinearCutlist([LP(2400, 2)], { barLength: 2400, kerf: 3 });
  assert.equal(r.totalBars, 2);
  assert.equal(r.totalWastePercent, 0);
});

test("calculateLinearCutlist: pièce plus longue que la barre → signalée, pas silencieusement perdue", () => {
  const r = C.calculateLinearCutlist([LP(3000, 1), LP(500, 2)], { barLength: 2400, kerf: 3 });
  assert.equal(r.unfitPieces.length, 1);
  assert.equal(r.unfitPieces[0].id, "p3000");
  assert.equal(r.totalBars, 1, "les 2 × 500 sont tout de même débitées");
});

test("calculateLinearCutlist: mélange de longueurs, jamais de dépassement, au plus ⌈borne⌉+1 barres", () => {
  const pieces = [LP(900, 3), LP(600, 4), LP(450, 5), LP(1100, 2)];
  const r = C.calculateLinearCutlist(pieces, { barLength: 2400, kerf: 3 });
  const total = 900 * 3 + 600 * 4 + 450 * 5 + 1100 * 2;
  assert.equal(r.usedLength, total, "toutes les pièces sont placées");
  const lower = Math.ceil(total / 2400);
  assert.ok(r.totalBars >= lower && r.totalBars <= lower + 1, `barres ${r.totalBars} vs borne ${lower}`);
  for (const bar of r.bars) {
    const n = bar.pieces.length;
    const need = bar.pieces.reduce((s, p) => s + p.length, 0) + 3 * (n - 1);
    assert.ok(need <= 2400, "chaque barre contient ses pièces + traits de scie");
    let x = 0;
    for (const p of bar.pieces) { assert.ok(p.x >= x - 1e-9, "pièces ordonnées sans chevauchement"); x = p.x + p.length; }
  }
});

test("calculateLinearCutlist: entrées vides / invalides", () => {
  assert.equal(C.calculateLinearCutlist([], { barLength: 2400, kerf: 3 }).totalBars, 0);
  const noBar = C.calculateLinearCutlist([LP(500, 2)], { barLength: 0, kerf: 3 });
  assert.equal(noBar.totalBars, 0);
  assert.equal(noBar.unfitPieces.length, 1, "longueur de barre nulle → pièces signalées");
  assert.equal(C.calculateLinearCutlist([{ id: "x", length: 0, quantity: 3 }, { id: "y", length: 500, quantity: 0 }], { barLength: 2400 }).totalBars, 0);
});

test("linearMetrics: prix au ml → prix de la barre dérivé, barres entières facturées", () => {
  const r = C.calculateLinearCutlist([LP(900, 3), LP(600, 4)], { barLength: 2400, kerf: 3 });
  assert.equal(r.totalBars, 3);
  const m = C.linearMetrics(r, { barLength: 2400 }, "4,2", { priceUnit: "ml", billing: "bar" });
  assert.ok(Math.abs(m.pricePerBar - 10.08) < 1e-9, "4,20 €/ml × 2,4 m");
  assert.ok(Math.abs(m.boughtM - 7.2) < 1e-9);
  assert.ok(Math.abs(m.usedM - 5.1) < 1e-9);
  assert.ok(Math.abs(m.totalCost - 3 * 10.08) < 1e-9);
  assert.equal(m.billedM, m.boughtM);
});

test("linearMetrics: prix à la barre → prix du ml dérivé ; facturation au ml débité", () => {
  const r = C.calculateLinearCutlist([LP(900, 3), LP(600, 4)], { barLength: 2400, kerf: 3 });
  const bar = C.linearMetrics(r, { barLength: 2400 }, 12, { priceUnit: "bar", billing: "bar" });
  assert.equal(bar.pricePerBar, 12);
  assert.ok(Math.abs(bar.pricePerMl - 5) < 1e-9, "12 € / 2,4 m");
  assert.equal(bar.totalCost, 36);
  const ml = C.linearMetrics(r, { barLength: 2400 }, 12, { priceUnit: "bar", billing: "ml" });
  assert.ok(Math.abs(ml.totalCost - 5.1 * 5) < 1e-9, "5,1 ml débités × 5 €/ml = 25,50 €");
  assert.ok(ml.totalCost < bar.totalCost, "payer au ml débité coûte moins que les barres entières");
  assert.equal(ml.billedM, ml.usedM);
});

test("linearMetrics: sans résultat ni prix → zéros, jamais NaN", () => {
  const m = C.linearMetrics(null, { barLength: 0 }, "", {});
  assert.equal(m.totalCost, 0);
  assert.equal(m.totalBars, 0);
  assert.equal(m.pricePerMl, 0);
});

test("linearCutListText: regroupe par désignation + longueur, total en mm", () => {
  const out = C.linearCutListText([
    { label: "Plinthe", length: 900, quantity: 3 },
    { label: "Plinthe", length: 900, quantity: 1 },
    { label: "Montant", length: 600, quantity: 2 },
    { label: "Vide", length: 0, quantity: 5 },
  ]);
  assert.equal(out.distinct, 2);
  assert.equal(out.totalPieces, 6);
  assert.equal(out.totalLength, 900 * 4 + 600 * 2);
  assert.match(out.text.split("\n")[0], /Qté\tDésignation\tLongueur \(mm\)/);
  assert.match(out.text, /4\tPlinthe\t900/);
  assert.match(out.text, /2\tMontant\t600/);
  assert.doesNotMatch(out.text, /Vide/);
});

test("applyTextFormat: sélection englobant des marques imbriquées (**__mot__**)", () => {
  // tout sélectionné, gras → retiré à travers le souligné
  let r = fmt("**__mot__**", 0, 11, "bold");
  assert.equal(r.text, "__mot__");
  // souligné retiré tout en gardant le gras
  r = fmt("**__mot__**", 0, 11, "underline");
  assert.equal(r.text, "**mot**");
  // curseur au centre de **__|__** : retire la paire demandée (gras) et garde le souligné
  r = fmt("**____**", 4, 4, "bold");
  assert.equal(r.text, "____");
  assert.equal(r.start, 2);
});

test("applyTextFormat: aller-retour — appliquer deux fois rend le texte d'origine (fuzz déterministe)", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const words = ["pose", "chêne", "2,40", "m", "plinthe", "à", "fournir", "→"];
  for (let iter = 0; iter < 300; iter++) {
    const nLines = 1 + rnd(3);
    const lines = [];
    for (let l = 0; l < nLines; l++) {
      const nw = rnd(4);
      lines.push(Array.from({ length: nw }, () => words[rnd(words.length)]).join(" ".repeat(1 + rnd(2))));
    }
    const text = lines.join("\n");
    const a = rnd(text.length + 1), b = rnd(text.length + 1);
    const s = Math.min(a, b), e = Math.max(a, b);
    for (const kind of ["bold", "italic", "underline", "ul", "ol"]) {
      const r1 = C.applyTextFormat(text, s, e, kind);
      const r2 = C.applyTextFormat(r1.text, r1.start, r1.end, kind);
      assert.equal(r2.text, text, `${kind} ×2 sur ${JSON.stringify(text)} [${s},${e}] → ${JSON.stringify(r1.text)} → ${JSON.stringify(r2.text)}`);
      // le parseur ne plante jamais, même sur un texte à moitié balisé
      C.parseRichText(r1.text);
    }
  }
});

test("parseRichText: robuste sur des entrées dégénérées (pas de boucle infinie ni d'exception)", () => {
  for (const t of ["*", "**", "***", "****", "_", "__", "\\", "\\\\*", "* *", "** **", "a**", "**a", "*a**", "__a_", "-", "- ", "1.", "1. ", "•", "\n\n- \n"]) {
    assert.doesNotThrow(() => C.parseRichText(t), JSON.stringify(t));
  }
  const long = "*a ".repeat(2000) + "**b ".repeat(2000);
  assert.doesNotThrow(() => C.parseRichText(long));
});

/* =========================================================================
   EXPORT / IMPORT D'UN SEUL DEVIS (additif)
   ========================================================================= */
const mkQuote = (over) => ({
  id: "q1", numero: "DEV-2026-001", dateISO: "2026-10-31",
  client: { nom: "Alice", adresse: "Rue X 1", email: "", tel: "" },
  chantier: "Dressing **sur mesure**", clientType: "particulier", tvaRate: 6, tvaFournitures: "",
  remiseType: "eur", remiseVal: "", deplacement: "", deplacementCout: "", acompte: "30", validite: "30", conditions: "- acompte 30 %",
  lines: [
    { id: "l1", type: "fourniture", designation: "MDF", qte: "2", unite: "m²", pa: "30", marge: "20", mlOn: false, mlItems: [] },
    { id: "l2", type: "main", designation: "Pose", heures: "4", tauxVente: "55", coutHoraire: "35" },
  ],
  ...over,
});

test("buildQuoteExport: enveloppe Établi à UN devis, sans _savedAt, id garanti, source intacte", () => {
  const q = mkQuote({ _savedAt: "2026-10-31T10:00:00.000Z" });
  const b = C.buildQuoteExport(q, { exportedAt: "2026-10-31T11:00:00.000Z" });
  assert.equal(b.app, "etabli");
  assert.equal(b.kind, "quote");
  assert.equal(b.exportedAt, "2026-10-31T11:00:00.000Z");
  assert.equal(b.data.quotes.length, 1);
  assert.equal(b.data.quotes[0].numero, "DEV-2026-001");
  assert.equal(b.data.quotes[0]._savedAt, undefined, "l'horodatage local n'est pas exporté");
  assert.equal(q._savedAt, "2026-10-31T10:00:00.000Z", "le devis d'origine n'est pas modifié");
  const noId = C.buildQuoteExport({ numero: "X", lines: [] }, {});
  assert.ok(noId.data.quotes[0].id, "un devis sans id reçoit un identifiant");
});

test("buildQuoteExport → readQuoteExport: aller-retour identique (chaîne JSON ou objet)", () => {
  const q = mkQuote();
  const file = JSON.stringify(C.buildQuoteExport(q, {}));
  assert.deepEqual(C.readQuoteExport(file), q);
  assert.deepEqual(C.readQuoteExport(C.buildQuoteExport(q, {})), q);
});

test("le fichier d'un devis reste lisible par « Restaurer » (readBackup) → fusion d'un devis", () => {
  const r = C.readBackup(JSON.stringify(C.buildQuoteExport(mkQuote(), {})));
  assert.equal(r.quotes.length, 1);
  assert.equal(r.settings, null);
  assert.equal(r.calepinage, null);
  assert.deepEqual(r.catalogue, []);
});

test("readQuoteExport: refus clairs (JSON cassé, autre appli, sauvegarde complète, 0 ou 2 devis)", () => {
  assert.throws(() => C.readQuoteExport("{pas du json"), /illisible|JSON/i);
  assert.throws(() => C.readQuoteExport("texte sans aucun objet"), /aucun objet JSON/i);
  assert.throws(() => C.readQuoteExport(JSON.stringify({ app: "autre", data: {} })), /pas un devis/i);
  assert.throws(() => C.readQuoteExport("[]"), /pas un devis/i);
  assert.throws(() => C.readQuoteExport(JSON.stringify(C.buildBackup({ quotes: [mkQuote()] }, {}))), /sauvegarde complète.*Restaurer/i,
    "une sauvegarde complète (même avec 1 devis) n'est pas un devis seul");
  const two = C.buildQuoteExport(mkQuote(), {});
  two.data.quotes.push(mkQuote({ id: "q2" }));
  assert.throws(() => C.readQuoteExport(two), /data\.quotes : 2 élément\(s\), attendu exactement 1/i);
  const zero = C.buildQuoteExport(mkQuote(), {});
  zero.data.quotes = [];
  assert.throws(() => C.readQuoteExport(zero), /data\.quotes : 0 élément\(s\)/i);
});

test("readQuoteExport: structure abîmée → erreur précise (chemin) ou réparée, jamais un plantage au chargement", () => {
  const wrap = (q) => ({ app: "etabli", kind: "quote", version: 1, data: { quotes: [q] } });
  const REQ = { numero: "A", dateISO: "2026-10-31", clientType: "particulier", tvaRate: 6, acompte: "30", validite: "30" };
  assert.throws(() => C.readQuoteExport(wrap("pas un objet")), /data\.quotes\[0\] : attendu un objet/);
  assert.throws(() => C.readQuoteExport(wrap({ ...REQ })), /data\.quotes\[0\]\.lines : champ obligatoire manquant/);
  assert.throws(() => C.readQuoteExport(wrap({ ...REQ, lines: [42] })), /lines\[0\] : attendu un objet, reçu le nombre 42/);
  assert.throws(() => C.readQuoteExport(wrap({ ...REQ, lines: [{ type: "fourniture" }, { type: "bizarre" }] })),
    /lines\[1\]\.type : valeur non autorisée.*"fourniture", "main", "forfait"/);
  // réparé : client manquant, ids absents ou en double
  const fixed = C.readQuoteExport(wrap({ ...REQ, lines: [{ type: "main" }, { id: "a", type: "main" }, { id: "a", type: "forfait" }] }));
  assert.deepEqual(fixed.client, { nom: "", adresse: "", email: "", tel: "" }, "client toujours présent");
  assert.ok(fixed.id, "id de devis généré");
  const ids = fixed.lines.map((l) => l.id);
  assert.equal(new Set(ids).size, 3, "ids de lignes présents et uniques");
});

test("quoteFileName: numéro nettoyé (accents, espaces, caractères interdits)", () => {
  assert.equal(C.quoteFileName({ numero: "DEV-2026-003" }, "2026-10-31"), "etabli-devis-DEV-2026-003-2026-10-31.json");
  assert.equal(C.quoteFileName({ numero: "Devis été/2026 n°4" }, "2026-10-31"), "etabli-devis-Devis-ete-2026-n-4-2026-10-31.json");
  assert.equal(C.quoteFileName({ numero: "  " }, "2026-10-31"), "etabli-devis-sans-numero-2026-10-31.json");
  assert.equal(C.quoteFileName({}, ""), "etabli-devis-sans-numero.json");
});

test("addImportedQuote: nouvel identifiant → ajouté en tête, l'existant est intact", () => {
  const list = [mkQuote({ id: "a", numero: "DEV-1" }), mkQuote({ id: "b", numero: "DEV-2" })];
  const r = C.addImportedQuote(list, mkQuote({ id: "c", numero: "DEV-3" }));
  assert.equal(r.status, "added");
  assert.equal(r.numeroClash, false);
  assert.deepEqual(r.list.map((q) => q.id), ["c", "a", "b"]);
  assert.equal(list.length, 2, "la liste d'entrée n'est pas mutée");
});

test("addImportedQuote: même id ET même contenu → déjà là, rien n'est ajouté (idempotent, _savedAt ignoré)", () => {
  const list = [mkQuote({ _savedAt: "2026-01-01T00:00:00.000Z" })];
  const r = C.addImportedQuote(list, mkQuote({ _savedAt: "2026-10-31T00:00:00.000Z" }));
  assert.equal(r.status, "duplicate");
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0]._savedAt, "2026-01-01T00:00:00.000Z", "l'existant n'est pas touché");
});

test("addImportedQuote: même id mais contenu différent → COPIE sous un nouvel id, l'original reste intact", () => {
  const original = mkQuote({ client: { nom: "Alice", adresse: "", email: "", tel: "" } });
  const edited = mkQuote({ client: { nom: "Alice modifiée", adresse: "", email: "", tel: "" } });
  const r = C.addImportedQuote([original], edited);
  assert.equal(r.status, "copy");
  assert.equal(r.list.length, 2);
  assert.notEqual(r.quote.id, "q1", "la copie a un nouvel identifiant");
  assert.equal(r.quote.client.nom, "Alice modifiée");
  const kept = r.list.find((q) => q.id === "q1");
  assert.equal(kept.client.nom, "Alice", "l'existant n'est pas écrasé");
  assert.equal(edited.id, "q1", "le devis entrant n'est pas muté");
});

test("addImportedQuote: un autre devis porte déjà ce numéro → signalé, numéro jamais modifié", () => {
  const list = [mkQuote({ id: "a", numero: "DEV-2026-001" })];
  const r = C.addImportedQuote(list, mkQuote({ id: "z", numero: "DEV-2026-001", client: { nom: "Zoé", adresse: "", email: "", tel: "" } }));
  assert.equal(r.status, "added");
  assert.equal(r.numeroClash, true);
  assert.equal(r.quote.numero, "DEV-2026-001", "le numéro appartient à l'utilisateur : inchangé");
  assert.equal(r.list.length, 2);
  // numéro vide : jamais un « conflit »
  assert.equal(C.addImportedQuote([mkQuote({ id: "a", numero: "" })], mkQuote({ id: "b", numero: "" })).numeroClash, false);
});

test("addImportedQuote: liste vide / absente, et devis hérités sans id (clé = numéro)", () => {
  assert.equal(C.addImportedQuote(undefined, mkQuote()).list.length, 1);
  const legacy = [{ numero: "DEV-OLD", client: { nom: "Ancien" }, lines: [] }];
  const r = C.addImportedQuote(legacy, mkQuote({ id: "n", numero: "DEV-NEW" }));
  assert.equal(r.status, "added");
  assert.equal(r.list.length, 2);
});

test("import additif: le devis importé se calcule comme à l'origine (lignes, montants, texte enrichi)", () => {
  const q = mkQuote();
  const back = C.readQuoteExport(JSON.stringify(C.buildQuoteExport(q, {})));
  const before = q.lines.map((l) => C.computeLine(l));
  const after = back.lines.map((l) => C.computeLine(l));
  assert.deepEqual(after, before);
  assert.equal(C.hasRichFormatting(back.chantier), true, "le balisage du texte enrichi voyage avec le devis");
});

/* =========================================================================
   EXPORT POUR L'IA — en-tête (consignes + schéma), lecteur tolérant, validateur léger
   ========================================================================= */
const AI_REQ = { numero: "A", dateISO: "2026-10-31", clientType: "particulier", tvaRate: 6, acompte: "30", validite: "30" };
const aiWrap = (q, extra) => ({ app: "etabli", kind: "quote", version: 1, ...(extra || {}), data: { quotes: [q] } });

test("buildQuoteExport: le fichier s'ouvre sur _instructions puis _schema, avant l'enveloppe et les données", () => {
  const b = C.buildQuoteExport(mkQuote(), { exportedAt: "2026-10-31T11:00:00.000Z" });
  assert.deepEqual(Object.keys(b), ["_instructions", "_schema", "app", "kind", "version", "exportedAt", "data"]);
  // l'ordre survit à une sérialisation JSON (c'est ce que l'IA reçoit)
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(b))).slice(0, 3), ["_instructions", "_schema", "app"]);
  assert.ok(Array.isArray(b._instructions) && b._instructions.length >= 8);
  assert.equal(b._schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(b._schema.type, "object");
  // copies : modifier l'export ne corrompt pas les constantes du noyau
  b._instructions.push("x");
  b._schema.title = "x";
  assert.notEqual(C.buildQuoteExport(mkQuote(), {})._schema.title, "x");
  assert.ok(C.buildQuoteExport(mkQuote(), {})._instructions.length < b._instructions.length);
});

test("buildQuoteExport: meta.aiHeader=false → export sans en-tête (enveloppe seule)", () => {
  const b = C.buildQuoteExport(mkQuote(), { aiHeader: false });
  assert.deepEqual(Object.keys(b), ["app", "kind", "version", "exportedAt", "data"]);
});

test("le fichier avec en-tête se relit à l'identique (en-tête ignoré) et reste lisible par « Restaurer »", () => {
  const q = mkQuote();
  const file = JSON.stringify(C.buildQuoteExport(q, {}), null, 2);
  assert.deepEqual(C.readQuoteExport(file), q);
  const r = C.readBackup(file);
  assert.equal(r.quotes.length, 1);
  assert.equal(r.settings, null);
});

test("un export de l'appli est valide contre son propre schéma, sans avertissement", () => {
  const res = C.validateQuoteFile(C.buildQuoteExport(mkQuote(), {}));
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
  // y compris avec une ligne au mètre linéaire et une ligne de calepinage
  const q = mkQuote({
    lines: [
      { id: "a", type: "fourniture", designation: "Baguette", detail: "", showDetail: true, showQty: true, qte: "", unite: "ml", pa: "4,2", marge: "30", tvaRate: "", heures: "", tauxVente: "", coutHoraire: "", mlOn: true, mlItems: [{ id: "i1", len: "2,4", qty: "3" }], mlUnit: "m", mlPerte: "10" },
      { id: "b", type: "forfait", designation: "Forfait", pa: 100, marge: "10" },
    ],
  });
  assert.deepEqual(C.validateQuoteFile(C.buildQuoteExport(q, {})).errors, []);
});

test("validateQuoteFile: TOUTES les erreurs d'un coup, avec chemin et message exploitable par l'IA", () => {
  const bad = C.buildQuoteExport(mkQuote(), {});
  const q = bad.data.quotes[0];
  q.tvaRate = "6 %";            // chaîne au lieu d'un nombre de l'enum
  q.dateISO = "31/10/2026";     // mauvais format de date
  q.clientType = "particular";  // faute de frappe
  delete q.numero;              // champ obligatoire absent
  q.lines[0].pa = "12 €";       // symbole dans un nombre
  q.lines[0].showDetail = "oui"; // booléen attendu
  q.lines[1].type = "bizarre";
  const { errors } = C.validateQuoteFile(bad);
  const byPath = Object.fromEntries(errors.map((e) => [e.path, e.message]));
  assert.equal(errors.length, 7, JSON.stringify(errors, null, 1));
  assert.match(byPath["data.quotes[0].numero"], /obligatoire manquant/);
  assert.match(byPath["data.quotes[0].tvaRate"], /valeur non autorisée.*6, 12, 21/);
  assert.match(byPath["data.quotes[0].dateISO"], /format invalide.*AAAA-MM-JJ/);
  assert.match(byPath["data.quotes[0].clientType"], /"particulier", "pro"/);
  assert.match(byPath["data.quotes[0].lines[0].pa"], /format invalide.*sans symbole ni unité/, "la description du champ sert de message d'erreur");
  assert.match(byPath["data.quotes[0].lines[0].showDetail"], /attendu un booléen/);
  assert.match(byPath["data.quotes[0].lines[1].type"], /"fourniture", "main", "forfait"/);
});

test("validateQuoteFile: nombres JSON ou chaînes acceptés, virgule décimale et vide aussi", () => {
  const ok = (pa) => C.validateQuoteFile(aiWrap({ ...AI_REQ, lines: [{ type: "fourniture", pa }] })).errors.length === 0;
  for (const good of ["12", "12,5", "12.5", "-3", "", "  7 ", 12, 12.5, 0]) assert.ok(ok(good), JSON.stringify(good));
  for (const bad of ["12 €", "1 234,5", "abc", "1,2,3", "€12", "12%", null, true]) assert.ok(!ok(bad), JSON.stringify(bad));
});

test("validateQuoteFile: champs inconnus = avertissements (jamais bloquants) ; clés « _… » réservées", () => {
  const q = { ...AI_REQ, lines: [{ type: "main", total: 99 }], totalHT: 123 };
  const res = C.validateQuoteFile(aiWrap(q, { _note: "ok", exportedAt: null }));
  assert.deepEqual(res.errors, []);
  const msgs = res.warnings.map((w) => w.path + " " + w.message).join("\n");
  assert.match(msgs, /data\.quotes\[0\] .*« totalHT »/);
  assert.match(msgs, /lines\[0\] .*« total »/);
  assert.doesNotMatch(msgs, /_note|_instructions/, "les clés _… ne sont pas signalées");
});

test("readQuoteExportDetailed: avertissements remontés, devis conservé tel quel (champs inconnus inclus)", () => {
  const r = C.readQuoteExportDetailed(aiWrap({ ...AI_REQ, lines: [{ type: "main", total: 99 }] }));
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /« total »/);
  assert.equal(r.quote.lines[0].total, 99, "rien n'est supprimé en silence");
});

test("l'erreur de lecture porte la liste détaillée (error.details) et un message prêt à coller", () => {
  let err;
  try { C.readQuoteExport(aiWrap({ ...AI_REQ, tvaRate: 5, lines: [{ type: "x" }] })); } catch (e) { err = e; }
  assert.ok(err, "doit lever");
  assert.equal(err.details.length, 2);
  assert.deepEqual(err.details.map((d) => d.path).sort(), ["data.quotes[0].lines[0].type", "data.quotes[0].tvaRate"]);
  assert.match(err.message, /2 erreurs\) :\n• data\.quotes\[0\]/);
  const fb = C.quoteFeedbackPrompt(err.message);
  assert.match(fb, /refusé par ÉTABLI/);
  assert.ok(fb.includes(err.message), "le message d'erreur est inclus tel quel");
  assert.match(fb, /renvoie le fichier JSON COMPLET/);
});

test("l'affichage des erreurs est borné (20 lignes + « … et N autre(s) »)", () => {
  const lines = Array.from({ length: 30 }, () => ({ type: "bizarre" }));
  let err;
  try { C.readQuoteExport(aiWrap({ ...AI_REQ, lines })); } catch (e) { err = e; }
  assert.equal(err.details.length, 30, "toutes les erreurs sont conservées");
  assert.equal(err.message.split("\n").filter((l) => l.startsWith("•")).length, 21);
  assert.match(err.message, /… et 10 autre\(s\)/);
});

/* ---------- lecteur tolérant ---------- */
const okJSON = JSON.stringify(aiWrap({ ...AI_REQ, lines: [{ type: "main", designation: "Pose, avec } et \"guillemets\"" }] }));

test("parseJSONLenient: JSON propre → lu strict, non réparé (BOM toléré)", () => {
  const r = C.parseJSONLenient(okJSON);
  assert.equal(r.repaired, false);
  assert.equal(C.parseJSONLenient("﻿" + okJSON).repaired, false);
});

test("parseJSONLenient: bloc ```json, phrases autour, virgules finales → réparé", () => {
  const fenced = "Voici le devis mis à jour :\n\n```json\n" + okJSON + "\n```\n\nDis-moi si tu veux autre chose !";
  const r1 = C.parseJSONLenient(fenced);
  assert.equal(r1.repaired, true);
  assert.equal(r1.value.data.quotes[0].lines[0].designation, "Pose, avec } et \"guillemets\"", "les accolades dans une chaîne ne cassent pas l'extraction");
  const prose = "Bien sûr. " + okJSON + " Voilà.";
  assert.equal(C.parseJSONLenient(prose).repaired, true);
  const trailing = '{ "a": [1, 2, 3,], "b": "x,}" , "c": { "d": 1, }, }';
  const r2 = C.parseJSONLenient(trailing);
  assert.deepEqual(r2.value, { a: [1, 2, 3], b: "x,}", c: { d: 1 } }, "virgules finales retirées, pas celles DANS les chaînes");
});

test("parseJSONLenient: réponse tronquée / sans objet / vraiment cassée → erreur explicite", () => {
  assert.throws(() => C.parseJSONLenient(okJSON.slice(0, 80)), /pas refermé.*tronquée/i);
  assert.throws(() => C.parseJSONLenient("Désolé, je ne peux pas."), /aucun objet JSON/i);
  assert.throws(() => C.parseJSONLenient('{ "a": nope }'), /JSON invalide/i);
});

test("readQuoteExportDetailed: une réponse d'IA collée telle quelle est acceptée, avec une remarque", () => {
  const chat = "Voici ton devis :\n```json\n" + okJSON.replace('"kind":"quote"', '"kind":"quote"') + "\n```";
  const r = C.readQuoteExportDetailed(chat);
  assert.equal(r.quote.numero, "A");
  assert.ok(r.warnings.some((w) => /nettoyé automatiquement/.test(w)));
  // sans réparation nécessaire : pas de remarque
  assert.deepEqual(C.readQuoteExportDetailed(okJSON).warnings, []);
});

test("le lecteur ne devine rien : champ obligatoire manquant ou type faux → refus, pas de valeur inventée", () => {
  const noTva = { ...AI_REQ }; delete noTva.tvaRate;
  assert.throws(() => C.readQuoteExport(aiWrap({ ...noTva, lines: [] })), /tvaRate : champ obligatoire manquant/);
  assert.throws(() => C.readQuoteExport(aiWrap({ ...AI_REQ, tvaRate: "6", lines: [] })), /tvaRate : valeur non autorisée/);
});

/* ---------- cohérence consignes ⇄ schéma (garde-fou contre la dérive) ---------- */
function schemaPropertyNames(node, acc) {
  if (!node || typeof node !== "object") return acc;
  if (node.properties) for (const k of Object.keys(node.properties)) { acc.add(k); schemaPropertyNames(node.properties[k], acc); }
  if (node.items) schemaPropertyNames(node.items, acc);
  return acc;
}

test("consignes IA: chaque champ cité existe dans le schéma, et les champs clés sont tous cités", () => {
  const known = schemaPropertyNames(C.quoteJsonSchema, new Set());
  const text = C.quoteAiInstructions.join("\n");
  // mots techniques en minuscules/camelCase cités dans les consignes
  const ALLOWED_NON_FIELDS = new Set(["json"]);
  const cited = new Set((text.match(/\b[a-z]+(?:[A-Z][a-z]+)*\b/g) || []).filter((w) => known.has(w)));
  for (const w of ["app", "kind", "version", "data", "tvaRate", "tvaFournitures", "clientType", "marge", "pa", "qte", "heures", "tauxVente",
    "coutHoraire", "mlOn", "mlItems", "mlUnit", "mlPerte", "unite", "numero", "id", "detail", "chantier", "conditions"]) {
    assert.ok(known.has(w), `le schéma doit définir « ${w} »`);
    assert.ok(cited.has(w) || new RegExp("\\b" + w + "\\b").test(text), `les consignes doivent mentionner « ${w} »`);
  }
  // les noms entre « ( ) » ou après « : » dans un style code (ex. `mlItems`) existent bien
  for (const m of text.matchAll(/\b(ml[A-Z]\w+|tva[A-Z]\w+|client[A-Z]\w+|taux[A-Z]\w+|cout[A-Z]\w+|show[A-Z]\w+|exported[A-Z]\w+)\b/g)) {
    assert.ok(known.has(m[1]) || ALLOWED_NON_FIELDS.has(m[1]), `champ cité mais absent du schéma : ${m[1]}`);
  }
});

test("le schéma embarqué n'utilise que les mots-clés que le validateur sait appliquer", () => {
  const SUPPORTED = new Set(["$schema", "title", "description", "type", "const", "enum", "pattern", "required", "properties", "items", "minItems", "maxItems"]);
  const bad = [];
  (function walk(n, path) {
    if (Array.isArray(n)) return n.forEach((x, i) => walk(x, path + "[" + i + "]"));
    if (!n || typeof n !== "object") return;
    const isPropsMap = /\.properties$/.test(path);
    for (const k of Object.keys(n)) {
      if (!isPropsMap && !SUPPORTED.has(k)) bad.push(path + "." + k);
      if (k === "properties" || k === "items") walk(n[k], path + "." + k);
    }
    if (isPropsMap) for (const k of Object.keys(n)) walk(n[k], path + "." + k);
  })(C.quoteJsonSchema, "$");
  assert.deepEqual(bad, [], "mot-clé non supporté par le validateur léger");
  // chaque champ documenté porte une description (c'est elle qui guide l'IA)
  const noDesc = [];
  (function walk(n, path) {
    if (!n || typeof n !== "object") return;
    if (n.properties) for (const k of Object.keys(n.properties)) {
      if (!n.properties[k].description) noDesc.push(path + "." + k);
      walk(n.properties[k], path + "." + k);
    }
    if (n.items) walk(n.items, path + "[]");
  })(C.quoteJsonSchema, "$");
  assert.deepEqual(noDesc, [], "champ sans description");
});
