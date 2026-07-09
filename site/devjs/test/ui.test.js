"use strict";
/* UI tests (Playwright + node:test).
   Needs: `npm install` (playwright) + `npx playwright install chromium`.
   The page pulls React/Babel from a CDN, so these tests need outbound network;
   we use ignoreHTTPSErrors because some sandboxes present an intercept cert.
   Pure logic is covered offline in core.test.js — this file checks the wiring. */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { chromium = null; }

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function startServer() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Skip gracefully (don't fail the suite) when the browser/network is unavailable.
test("UI", { skip: chromium ? false : "playwright not installed" }, async (t) => {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  // Some sandboxes/CI ship a pre-installed Chromium whose build differs from the
  // pinned Playwright version. Let them point at it via PW_EXECUTABLE_PATH
  // instead of forcing `npx playwright install`.
  const execPath = process.env.PW_EXECUTABLE_PATH;
  const browser = await chromium.launch(execPath ? { executablePath: execPath } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

  t.after(async () => { await browser.close(); server.close(); });

  const newPage = async () => {
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p._errors = errors;
    await p.goto(base, { waitUntil: "load", timeout: 45000 });
    await p.waitForSelector(".brand-name", { timeout: 30000 });
    return p;
  };

  await t.test("margin input shows the typed % (regression: no value swap)", async () => {
    const p = await newPage();
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const pa = p.locator(".line").getByText("Prix d'achat / u").locator("..").locator("input");
    await pa.fill("200");
    const marge = p.locator(".line").getByText("Marge", { exact: true }).locator("..").locator("input");
    await marge.fill("30");
    await p.waitForTimeout(120);
    assert.equal(await marge.inputValue(), "30", "margin field must keep what was typed");
    const figs = await p.locator(".line-figs").innerText();
    assert.match(figs, /Marge\s+60,00/, "computed € margin = 260 − 200 = 60");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("changing PA does not alter the typed margin %", async () => {
    const p = await newPage();
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const pa = p.locator(".line").getByText("Prix d'achat / u").locator("..").locator("input");
    const marge = p.locator(".line").getByText("Marge", { exact: true }).locator("..").locator("input");
    await marge.fill("40");
    await pa.fill("999");
    await p.waitForTimeout(120);
    assert.equal(await marge.inputValue(), "40");
    await p.close();
  });

  await t.test("TVA fournitures: taux distinct → ventilation 6 %/21 % sur le devis", async () => {
    const p = await newPage();

    // une fourniture (HTVA 100, marge 0) + de la main-d'œuvre (HTVA 550)
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const f = p.locator(".line").first();
    await f.getByText("Prix d'achat / u").locator("..").locator("input").fill("100");
    await f.getByText("Marge", { exact: true }).locator("..").locator("input").fill("0");

    await p.click('button.add:has-text("Main-d")');
    await p.waitForTimeout(120);
    const m = p.locator(".line").nth(1);
    await m.getByText("Heures").locator("..").locator("input").fill("10");
    await m.getByText("Taux facturé / h").locator("..").locator("input").fill("55");

    // taux principal 6 % (défaut), fournitures à 21 %
    await p.getByText("TVA fournitures").locator("..").locator("select").selectOption("21");
    await p.waitForTimeout(120);

    // côté client : deux lignes de TVA distinctes (21 % et 6 %)
    await p.click('button:has-text("Devis client")');
    await p.waitForSelector(".s-totals");
    const totals = await p.locator(".s-totals").innerText();
    assert.match(totals, /TVA 21 %/, "TVA fournitures à 21 %");
    assert.match(totals, /TVA 6 %/, "TVA principale à 6 %");
    assert.match(totals, /21,00/, "100 € × 21 % = 21,00 €");
    assert.match(totals, /33,00/, "550 € × 6 % = 33,00 €");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("TVA par ligne: override sur une fourniture, l'autre suit le défaut", async () => {
    const p = await newPage();

    // fourniture 1 : HTVA 100, override TVA de la ligne → 21 %
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const f1 = p.locator(".line").nth(0);
    await f1.getByText("Prix d'achat / u").locator("..").locator("input").fill("100");
    await f1.getByText("Marge", { exact: true }).locator("..").locator("input").fill("0");
    await f1.getByText("TVA de cette ligne").locator("..").locator("select").selectOption("21");

    // fourniture 2 : HTVA 200, laissée au taux par défaut (6 %)
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForTimeout(120);
    const f2 = p.locator(".line").nth(1);
    await f2.getByText("Prix d'achat / u").locator("..").locator("input").fill("200");
    await f2.getByText("Marge", { exact: true }).locator("..").locator("input").fill("0");

    await p.click('button:has-text("Devis client")');
    await p.waitForSelector(".s-totals");
    const totals = await p.locator(".s-totals").innerText();
    assert.match(totals, /TVA 21 %/, "ligne 1 forcée à 21 %");
    assert.match(totals, /TVA 6 %/, "ligne 2 au défaut 6 %");
    assert.match(totals, /21,00/, "100 € × 21 % = 21,00 €");
    assert.match(totals, /12,00/, "200 € × 6 % = 12,00 €");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("Mes devis: enregistrer deux devis les garde tous les deux (régression perte de devis)", async () => {
    const p = await newPage();

    // Devis 1 : client Alice, on enregistre.
    await p.locator('label.fld:has(span.fld-lab:text-is("Client")) input').fill("Alice");
    await p.click('button:has-text("Enregistrer")');
    await p.waitForTimeout(150);

    // Nouveau devis (numéro auto-incrémenté), client Bob, on enregistre.
    await p.click('button:has-text("Nouveau")');
    await p.waitForTimeout(150);
    await p.locator('label.fld:has(span.fld-lab:text-is("Client")) input').fill("Bob");
    await p.click('button:has-text("Enregistrer")');
    await p.waitForTimeout(150);

    // « Mes devis » doit lister DEUX devis, pas seulement le dernier.
    await p.click('button:has-text("Mes devis")');
    await p.waitForSelector(".qrow");
    assert.equal(await p.locator(".qrow").count(), 2, "les deux devis doivent être conservés");
    const metas = await p.locator(".qrow-meta").allInnerTexts();
    assert.ok(metas.some((m) => /Alice/.test(m)), "le 1ᵉʳ devis (Alice) ne doit pas avoir disparu");
    assert.ok(metas.some((m) => /Bob/.test(m)), "le 2ᵉ devis (Bob) est présent");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("calepinage: counts whole panels, draws layout, builds cut list, adds devis line", async () => {
    const p = await newPage();
    await p.click('button:has-text("Calepinage")');
    await p.waitForSelector(".cl");
    const price = p.locator(".cl .grid").getByText("Prix matière").locator("..").locator("input");
    await price.fill("25");
    await p.click('button.add:has-text("Ajouter une pièce")');
    await p.waitForSelector(".cl-prow:not(.cl-prow-head)");
    const row = p.locator(".cl-prow:not(.cl-prow-head)").first();
    await row.locator("input").nth(0).fill("Étagère");
    await row.locator("input").nth(1).fill("600");
    await row.locator("input").nth(2).fill("400");
    await row.locator("input").nth(3).fill("10");
    await p.waitForTimeout(300);

    const stats = await p.locator(".cl-stats").innerText();
    assert.match(stats, /PANNEAUX À ACHETER[\s\S]*\b1\b/i, "10×(600×400) fit on one 2500×1250 panel");
    assert.match(stats, /78,13/, "cost = 3,125 m² × 25 €/m²");
    assert.equal(await p.locator(".cl-svg").count(), 1, "one panel diagram");
    assert.equal(await p.locator(".cl-svg g rect").count(), 10, "ten placed pieces drawn");

    const list = await p.locator(".cl-list").inputValue();
    assert.match(list, /Qté\tDésignation\tLongueur \(mm\)\tLargeur \(mm\)/);
    assert.match(list, /10\tÉtagère\t600\t400/);

    await p.click('button:has-text("Ajouter au devis")');
    await p.waitForSelector(".line");
    assert.equal(await p.locator(".line").count(), 1);
    assert.equal(await p.locator(".line-title").first().inputValue(), "Panneau — débit calepiné");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("calepinage: oversized piece is flagged, not silently dropped", async () => {
    const p = await newPage();
    await p.click('button:has-text("Calepinage")');
    await p.waitForSelector(".cl");
    await p.click('button.add:has-text("Ajouter une pièce")');
    const row = p.locator(".cl-prow:not(.cl-prow-head)").first();
    await row.locator("input").nth(1).fill("3000"); // > 2500
    await row.locator("input").nth(2).fill("400");
    await row.locator("input").nth(3).fill("1");
    await p.waitForTimeout(300);
    await p.waitForSelector(".cl-warn");
    assert.match(await p.locator(".cl-warn").innerText(), /ne tiennent pas/);
    await p.close();
  });

  await t.test("calepinage: deux matériaux distincts → deux lignes de devis en un coup", async () => {
    const p = await newPage();
    await p.click('button:has-text("Calepinage")');
    await p.waitForSelector(".cl");

    // Matière 1 : MDF 18 à 30 €/m², une pièce qui tient sur un panneau.
    const name = () => p.locator(".cl .grid").getByText("Matière / désignation").locator("..").locator("input");
    const price = () => p.locator(".cl .grid").getByText("Prix matière").locator("..").locator("input");
    await name().fill("MDF 18");
    await price().fill("30");
    await p.click('button.add:has-text("Ajouter une pièce")');
    let row = p.locator(".cl-prow:not(.cl-prow-head)").first();
    await row.locator("input").nth(1).fill("600");
    await row.locator("input").nth(2).fill("400");
    await row.locator("input").nth(3).fill("4");

    // Nouvelle matière : aglo 8 à 15 €/m².
    await p.click("button.cl-mat-add");
    await p.waitForTimeout(150);
    await name().fill("Aglo 8");
    await price().fill("15");
    await p.click('button.add:has-text("Ajouter une pièce")');
    row = p.locator(".cl-prow:not(.cl-prow-head)").first();
    await row.locator("input").nth(1).fill("800");
    await row.locator("input").nth(2).fill("500");
    await row.locator("input").nth(3).fill("2");
    await p.waitForTimeout(300);

    // Deux onglets, et le bandeau de total tous matériaux apparaît.
    assert.equal(await p.locator(".cl-mat").count(), 2, "deux onglets matière");
    await p.waitForSelector(".cl-grand");
    assert.match(await p.locator(".cl-grand").innerText(), /2 lignes/);

    // « Ajouter tout au devis » → une ligne fourniture par matière.
    await p.click('button:has-text("Ajouter tout au devis")');
    await p.waitForSelector(".line");
    assert.equal(await p.locator(".line").count(), 2, "une ligne par matériau");
    const titles = await p.locator(".line-title").evaluateAll((els) => els.map((e) => e.value));
    assert.ok(titles.includes("MDF 18 — débit calepiné"), "ligne MDF présente");
    assert.ok(titles.includes("Aglo 8 — débit calepiné"), "ligne aglo présente");
    assert.deepEqual(p._errors, []);
    await p.close();
  });
});
