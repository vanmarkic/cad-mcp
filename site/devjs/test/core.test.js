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
