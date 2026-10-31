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
const os = require("node:os");

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

  // Offline mode: when PW_VENDOR_DIR points at a folder holding react.js /
  // react-dom.js / babel.js, serve the CDN scripts from disk so the suite runs
  // without network. Online (CI/dev) it's unset and the real CDN is used.
  const vendorDir = process.env.PW_VENDOR_DIR;
  if (vendorDir) {
    await ctx.route(/unpkg\.com|jsdelivr\.net/, (route) => {
      const u = route.request().url();
      const file = /react-dom/.test(u) ? "react-dom.js" : /react/.test(u) ? "react.js" : /babel/.test(u) ? "babel.js" : null;
      if (file) return route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(vendorDir, file)) });
      return route.continue();
    });
  }

  // Isolation : les tests partagent le même contexte (donc le même localStorage).
  // On repart d'un stockage vide à chaque chargement de page pour qu'un test
  // n'hérite pas des devis / du catalogue / du calepinage d'un autre.
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

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

  await t.test("Sauvegarde: exporter puis restaurer récupère un devis supprimé", async () => {
    const p = await newPage();

    // Enregistre un devis "Alice".
    await p.locator('label.fld:has(span.fld-lab:text-is("Client")) input').fill("Alice");
    await p.click('button:has-text("Enregistrer")');
    await p.waitForTimeout(150);

    // Réglages → exporte, capture le fichier téléchargé.
    await p.click('button:has-text("Réglages")');
    await p.waitForSelector("text=Sauvegarde des données");
    const [download] = await Promise.all([
      p.waitForEvent("download"),
      p.click('button:has-text("Sauvegarder")'),
    ]);
    const file = path.join(os.tmpdir(), "etabli-backup-test.json");
    await download.saveAs(file);
    const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(bundle.app, "etabli", "fichier de sauvegarde Établi");
    assert.equal(bundle.data.quotes.length, 1, "le devis Alice est dans la sauvegarde");

    // Simule la perte : supprime le devis Alice.
    await p.keyboard.press("Escape");
    await p.click('button:has-text("Mes devis")');
    await p.waitForSelector(".qrow");
    await p.click(".qrow .btn.danger");
    await p.waitForTimeout(120);
    assert.equal(await p.locator(".qrow").count(), 0, "devis supprimé");
    await p.keyboard.press("Escape");

    // Restaure depuis le fichier (input caché → setInputFiles direct).
    await p.click('button:has-text("Réglages")');
    await p.waitForSelector("text=Sauvegarde des données");
    await p.locator(".reglages-file").setInputFiles(file);
    await p.waitForTimeout(200);

    // Le devis Alice est de retour.
    await p.click('button:has-text("Mes devis")');
    await p.waitForSelector(".qrow");
    assert.equal(await p.locator(".qrow").count(), 1, "le devis restauré est revenu");
    assert.match(await p.locator(".qrow-meta").first().innerText(), /Alice/);
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("Catalogue: cataloguer une fourniture, puis l'insérer et l'auto-compléter", async () => {
    const p = await newPage();
    const desig = (line) => line.locator(".line-title");
    const fld = (line, label) => line.getByText(label, { exact: true }).locator("..").locator("input");

    // Encode une fourniture puis clique ☆ pour la mémoriser.
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const line = p.locator(".line").first();
    await desig(line).fill("MDF 18mm");
    await fld(line, "Prix d'achat / u").fill("30");
    await fld(line, "Unité").fill("m²");
    await fld(line, "Marge").fill("20");
    await line.locator(".ico-cat").click();
    await p.waitForTimeout(150);
    assert.match(await p.locator('button:has-text("Catalogue")').first().innerText(), /\(1\)/, "le catalogue compte 1 article");

    // Modale Catalogue → l'article est là → « Insérer » ajoute une ligne pré-remplie.
    await p.click('button:has-text("Catalogue")');
    await p.waitForSelector(".cat-list .qrow");
    assert.equal(await p.locator(".cat-list .qrow").count(), 1);
    assert.match(await p.locator(".cat-list .qrow-num").first().innerText(), /MDF 18mm/);
    await p.click('.cat-list .qrow .btn:has-text("Insérer")');
    await p.waitForTimeout(150);
    assert.equal(await p.locator(".line").count(), 2, "une nouvelle fourniture est insérée");
    const line2 = p.locator(".line").nth(1);
    assert.equal(await desig(line2).inputValue(), "MDF 18mm");
    assert.equal(await fld(line2, "Prix d'achat / u").inputValue(), "30");

    // Auto-complétion : sur une ligne neuve, taper « mdf » propose l'article et le remplit.
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForTimeout(100);
    const line3 = p.locator(".line").nth(2);
    await desig(line3).click();
    await desig(line3).fill("mdf");
    await line3.locator(".ac .ac-item").first().waitFor({ timeout: 4000 });
    await line3.locator(".ac .ac-item").first().click();
    await p.waitForTimeout(120);
    assert.equal(await desig(line3).inputValue(), "MDF 18mm", "l'auto-complétion remplit la désignation");
    assert.equal(await fld(line3, "Prix d'achat / u").inputValue(), "30", "et le prix d'achat");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("Sauvegarde: le catalogue est inclus dans l'export/restore", async () => {
    const p = await newPage();
    const line = p.locator(".line").first();
    // Catalogue un article.
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    await line.locator(".line-title").fill("Charnière invisible");
    await line.getByText("Prix d'achat / u", { exact: true }).locator("..").locator("input").fill("4,2");
    await line.locator(".ico-cat").click();
    await p.waitForTimeout(120);

    // Exporte → le catalogue est dans le fichier.
    await p.click('button:has-text("Réglages")');
    await p.waitForSelector("text=Sauvegarde des données");
    const [download] = await Promise.all([
      p.waitForEvent("download"),
      p.click('button:has-text("Sauvegarder")'),
    ]);
    const file = path.join(os.tmpdir(), "etabli-backup-cat.json");
    await download.saveAs(file);
    const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(bundle.data.catalogue.length, 1, "le catalogue est dans la sauvegarde");
    assert.match(bundle.data.catalogue[0].designation, /Charnière invisible/);

    // Supprime l'article puis restaure → il revient.
    await p.keyboard.press("Escape");
    await p.click('button:has-text("Catalogue")');
    await p.waitForSelector(".cat-list .qrow");
    await p.click(".cat-list .qrow .btn.danger");
    await p.waitForTimeout(120);
    assert.equal(await p.locator(".cat-list .qrow").count(), 0, "article supprimé");
    await p.keyboard.press("Escape");
    await p.click('button:has-text("Réglages")');
    await p.waitForSelector("text=Sauvegarde des données");
    await p.locator(".reglages-file").setInputFiles(file);
    await p.waitForTimeout(200);
    await p.click('button:has-text("Catalogue")');
    await p.waitForSelector(".cat-list .qrow");
    assert.equal(await p.locator(".cat-list .qrow").count(), 1, "article restauré");
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
  /* ======================= formatage du texte libre ======================= */
  await t.test("formatage: gras via la barre d'outils, bascule, puis rendu sur le devis client", async () => {
    const p = await newPage();
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const ta = p.locator(".line .line-detail textarea");
    await ta.fill("Pose incluse");
    await ta.evaluate((el) => { el.focus(); el.setSelectionRange(5, 12); });
    const gras = p.locator('.line .line-detail button[aria-label="Gras"]');
    await gras.click();
    assert.equal(await ta.inputValue(), "Pose **incluse**");
    assert.match(await p.locator(".line .rt-preview").innerText(), /incluse/, "aperçu affiché dès qu'il y a du balisage");
    assert.equal(await p.locator(".line .rt-preview strong").innerText(), "incluse");

    // la sélection est restaurée → un 2ᵉ clic retire le gras
    await gras.click();
    assert.equal(await ta.inputValue(), "Pose incluse");
    assert.equal(await p.locator(".line .rt-preview").count(), 0, "plus d'aperçu sans balisage");
    await gras.click();

    // liste à puces sur une 2ᵉ ligne
    await ta.evaluate((el) => { el.focus(); el.value = el.value; });
    await ta.fill("Pose **incluse**\nDépose\nÉvacuation");
    await ta.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.indexOf("Dépose"), el.value.length); });
    await p.locator('.line .line-detail button[aria-label="Liste à puces"]').click();
    assert.equal(await ta.inputValue(), "Pose **incluse**\n- Dépose\n- Évacuation");

    // côté client : le métré (affiché) est rendu en gras + puces, sans les astérisques
    await p.locator(".line").getByText("Afficher le métré sur le devis").click();
    await p.click('button:has-text("Devis client")');
    await p.waitForSelector(".s-table");
    assert.equal(await p.locator(".s-detail strong").innerText(), "incluse");
    assert.equal(await p.locator(".s-detail li").count(), 2);
    const txt = await p.locator(".s-detail").innerText();
    assert.doesNotMatch(txt, /\*\*/, "plus de balisage visible chez le client");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("formatage: raccourci Ctrl+B, conditions en liste, description du chantier en italique", async () => {
    const p = await newPage();
    const field = (label) => p.locator(`.fld:has(> .fld-lab:text-is("${label}")) textarea`);

    const cond = field("Conditions (bas de devis)");
    await cond.fill("Modalités :\n- acompte 30 %\n- solde à la fin");
    await cond.evaluate((el) => { el.focus(); el.setSelectionRange(0, 11); });
    await cond.press("Control+b");
    assert.equal(await cond.inputValue(), "**Modalités :**\n- acompte 30 %\n- solde à la fin");

    const ch = field("Description du chantier");
    await ch.fill("Dressing sur mesure");
    await ch.evaluate((el) => { el.focus(); el.setSelectionRange(0, el.value.length); });
    await p.locator('.fld:has(> .fld-lab:text-is("Description du chantier")) button[aria-label="Italique"]').click();
    assert.equal(await ch.inputValue(), "*Dressing sur mesure*");

    await p.click('button:has-text("Devis client")');
    await p.waitForSelector(".s-table");
    assert.equal(await p.locator(".s-cond strong").innerText(), "Modalités :");
    assert.equal(await p.locator(".s-cond li").count(), 2, "deux puces dans les conditions");
    assert.equal(await p.locator(".s-parties em").innerText(), "Dressing sur mesure");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("formatage: le HTML saisi n'est jamais interprété (pas d'injection)", async () => {
    const p = await newPage();
    const cond = p.locator('.fld:has(> .fld-lab:text-is("Conditions (bas de devis)")) textarea');
    await cond.fill('<img src=x onerror="window.__pwned=1"> **gras**');
    await p.click('button:has-text("Devis client")');
    await p.waitForSelector(".s-cond");
    assert.equal(await p.locator(".s-cond img").count(), 0, "aucune balise injectée");
    assert.match(await p.locator(".s-cond").innerText(), /<img src=x/, "affiché comme du texte");
    assert.equal(await p.evaluate(() => window.__pwned), undefined);
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  /* ======================= mètre linéaire : fournitures ======================= */
  await t.test("fourniture au mètre linéaire: longueurs + chute → quantité en ml, prix, devis client, détail au métré", async () => {
    const p = await newPage();
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const line = p.locator(".line").first();
    await line.locator(".line-title").fill("Baguette chêne 20×20");
    await line.locator(".ml-toggle input").check();
    await p.waitForSelector(".ml-box");

    // 3 × 2,4 m, puis une 2ᵉ longueur 2 × 1,2 m, chute 10 % → 9,6 × 1,1 = 10,56 ml
    await line.locator('.ml-row input[aria-label="Longueur"]').first().fill("2,4");
    await line.locator('.ml-row input[aria-label="Quantité de cette longueur"]').first().fill("3");
    await line.locator("button:has-text('+ Longueur')").click();
    await line.locator('.ml-row input[aria-label="Longueur"]').nth(1).fill("1,2");
    await line.locator('.ml-row input[aria-label="Quantité de cette longueur"]').nth(1).fill("2");
    await line.locator(".ml-perte input").fill("10");
    await line.getByText("Prix d'achat / ml").locator("..").locator("input").fill("4,2");
    await line.getByText("Marge", { exact: true }).locator("..").locator("input").fill("0");
    await p.waitForTimeout(150);

    assert.equal(await line.getByText("Quantité (métré)").locator("..").locator("input").inputValue(), "10,56");
    assert.equal(await line.getByText("Unité", { exact: true }).locator("..").locator("input").inputValue(), "ml");
    assert.equal(await line.getByText("Quantité (métré)").locator("..").locator("input").getAttribute("readonly"), "");
    assert.match(await line.locator(".ml-sum").innerText(), /9,6 ml/);
    assert.match(await line.locator(".ml-qte").innerText(), /10,56 ml/);
    assert.match(await line.locator(".line-figs").innerText(), /Vente HTVA\s+44,35/, "10,56 ml × 4,20 € = 44,352 €");

    // le détail au métré se remplit en puces
    await line.locator("button:has-text('Détail au métré')").click();
    const detail = await line.locator(".line-detail textarea").inputValue();
    assert.equal(detail, "Longueurs :\n- 3 × 2,4 m\n- 2 × 1,2 m\nTotal : 9,6 ml + 10 % de chute = 10,56 ml");

    await p.click('button:has-text("Devis client")');
    await p.waitForSelector(".s-table");
    const row = await p.locator(".s-table tbody tr").first().innerText();
    assert.match(row, /10,56 ml/, "quantité en ml sur la feuille client");
    assert.match(row, /4,20/, "PU HTVA au mètre");
    assert.match(row, /44,35/, "total HTVA");
    assert.equal(await p.locator(".s-detail li").count(), 2, "les longueurs s'affichent en puces");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("fourniture au mètre linéaire: décocher garde la quantité calculée, l'unité cm/mm convertit", async () => {
    const p = await newPage();
    await p.click('button.add:has-text("Fourniture")');
    await p.waitForSelector(".line");
    const line = p.locator(".line").first();
    await line.locator(".ml-toggle input").check();
    await line.locator('.ml-row input[aria-label="Longueur"]').first().fill("240");
    await line.locator('.ml-row input[aria-label="Quantité de cette longueur"]').first().fill("2");
    await line.locator('select[aria-label="Unité des longueurs"]').selectOption("cm");
    await p.waitForTimeout(100);
    const qte = line.getByText("Quantité (métré)").locator("..").locator("input");
    assert.equal(await qte.inputValue(), "4,8", "2 × 240 cm = 4,8 m");
    await line.locator('select[aria-label="Unité des longueurs"]').selectOption("mm");
    await p.waitForTimeout(100);
    assert.equal(await qte.inputValue(), "0,48", "2 × 240 mm = 0,48 m");

    await line.locator(".ml-toggle input").uncheck();
    await p.waitForTimeout(100);
    assert.equal(await qte.inputValue(), "0,48", "la quantité calculée devient la valeur saisie");
    await qte.fill("5");
    await p.waitForTimeout(100);
    assert.match(await line.locator(".line-figs").innerText(), /Coût\s+0,00/, "mode normal : la quantité saisie s'applique à nouveau");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  /* ======================= mètre linéaire : calepinage ======================= */
  await t.test("calepinage barres: découpe 1D, nombre de barres, coût au ml, ligne de devis en barres", async () => {
    const p = await newPage();
    await p.click('button:has-text("Calepinage")');
    await p.waitForSelector(".cl");
    await p.click("button.cl-lin-add");
    await p.waitForSelector('.cl .grid:has-text("Longueur de la barre")');
    const g = p.locator(".cl .grid");
    await g.getByText("Matière / désignation").locator("..").locator("input").fill("Baguette chêne");
    await g.getByText("Prix matière").locator("..").locator("input").fill("4,2");
    assert.equal(await g.getByText("Longueur de la barre").locator("..").locator("input").inputValue(), "2400");

    const addRow = async (label, len, qty) => {
      await p.click('button.add:has-text("Ajouter une pièce")');
      const rows = p.locator(".cl-prow:not(.cl-prow-head)");
      const row = rows.nth((await rows.count()) - 1);
      assert.equal(await row.locator("input").count(), 3, "désignation, longueur, quantité (pas de largeur)");
      await row.locator("input").nth(0).fill(label);
      await row.locator("input").nth(1).fill(len);
      await row.locator("input").nth(2).fill(qty);
    };
    await addRow("Plinthe", "900", "3");
    await addRow("Montant", "600", "4");
    await p.waitForTimeout(300);

    const stats = await p.locator(".cl-stats").innerText();
    assert.match(stats, /BARRES À ACHETER[\s\S]*\b3\b/i, "5,1 m à débiter dans des barres de 2,4 m → 3 barres");
    assert.match(stats, /7,2 ml/, "3 barres × 2,4 m achetés");
    assert.match(stats, /30,24/, "3 × (2,4 m × 4,20 €) = 30,24 €");
    assert.equal(await p.locator(".cl-svg-bar").count(), 3, "un schéma par barre");
    assert.match(await p.locator(".cl-pu-note").innerText(), /4,20.*\/ ml.*10,08.*\/ barre/);
    const list = await p.locator(".cl-list").inputValue();
    assert.match(list, /Qté\tDésignation\tLongueur \(mm\)/);
    assert.match(list, /3\tPlinthe\t900/);
    assert.match(list, /4\tMontant\t600/);

    await p.click('button:has-text("Ajouter au devis")');
    await p.waitForSelector(".line");
    const line = p.locator(".line").first();
    assert.equal(await line.locator(".line-title").inputValue(), "Baguette chêne — débit calepiné");
    assert.equal(await line.getByText("Quantité (métré)").locator("..").locator("input").inputValue(), "3");
    assert.equal(await line.getByText("Unité", { exact: true }).locator("..").locator("input").inputValue(), "barre");
    assert.equal(await line.getByText("Prix d'achat / u").locator("..").locator("input").inputValue(), "10.08");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("calepinage barres: facturation au mètre débité, prix à la barre, pièce trop longue signalée", async () => {
    const p = await newPage();
    await p.click('button:has-text("Calepinage")');
    await p.waitForSelector(".cl");
    await p.click("button.cl-lin-add");
    const g = p.locator(".cl .grid");
    await g.getByText("Prix matière").locator("..").locator("input").fill("12");
    await g.getByText("Prix matière").locator("..").locator("select").selectOption("bar");
    await g.getByText("Facturation").locator("..").locator("select").selectOption("ml");

    for (const [len, qty] of [["900", "3"], ["600", "4"], ["3000", "1"]]) {
      await p.click('button.add:has-text("Ajouter une pièce")');
      const rows = p.locator(".cl-prow:not(.cl-prow-head)");
      const row = rows.nth((await rows.count()) - 1);
      await row.locator("input").nth(1).fill(len);
      await row.locator("input").nth(2).fill(qty);
    }
    await p.waitForTimeout(300);
    await p.waitForSelector(".cl-warn");
    assert.match(await p.locator(".cl-warn").innerText(), /plus longues qu'une barre/);

    const stats = await p.locator(".cl-stats").innerText();
    assert.match(stats, /MÈTRES FACTURÉS/i);
    assert.match(stats, /5,1 ml/, "seuls les mètres débités sont facturés");
    assert.match(stats, /25,50/, "5,1 ml × (12 € / 2,4 m = 5 €/ml)");

    await p.click('button:has-text("Ajouter au devis")');
    await p.waitForSelector(".line");
    const line = p.locator(".line").first();
    assert.equal(await line.getByText("Unité", { exact: true }).locator("..").locator("input").inputValue(), "ml");
    assert.equal(await line.getByText("Quantité (métré)").locator("..").locator("input").inputValue(), "5.1");
    assert.equal(await line.getByText("Prix d'achat / u").locator("..").locator("input").inputValue(), "5");
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  await t.test("calepinage: panneau + barre dans le même calepinage → deux lignes en un coup", async () => {
    const p = await newPage();
    await p.click('button:has-text("Calepinage")');
    await p.waitForSelector(".cl");
    const g = () => p.locator(".cl .grid");
    // panneau
    await g().getByText("Matière / désignation").locator("..").locator("input").fill("MDF 18");
    await g().getByText("Prix matière").locator("..").locator("input").fill("30");
    await p.click('button.add:has-text("Ajouter une pièce")');
    let row = p.locator(".cl-prow:not(.cl-prow-head)").first();
    await row.locator("input").nth(1).fill("600");
    await row.locator("input").nth(2).fill("400");
    await row.locator("input").nth(3).fill("4");
    // barre
    await p.click("button.cl-lin-add");
    await g().getByText("Matière / désignation").locator("..").locator("input").fill("Plinthe");
    await g().getByText("Prix matière").locator("..").locator("input").fill("3");
    await p.click('button.add:has-text("Ajouter une pièce")');
    row = p.locator(".cl-prow:not(.cl-prow-head)").first();
    await row.locator("input").nth(1).fill("1000");
    await row.locator("input").nth(2).fill("5");
    await p.waitForTimeout(300);

    await p.waitForSelector(".cl-grand");
    const grand = await p.locator(".cl-grand").innerText();
    assert.match(grand, /1 panneau/);
    assert.match(grand, /3 barre/, "5 × 1 m dans des barres de 2,4 m → 3 barres");
    assert.match(grand, /2 lignes/);
    await p.click('button:has-text("Ajouter tout au devis")');
    await p.waitForSelector(".line");
    const titles = await p.locator(".line-title").evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(titles.sort(), ["MDF 18 — débit calepiné", "Plinthe — débit calepiné"]);
    assert.deepEqual(p._errors, []);
    await p.close();
  });

  /* ======================= compatibilité : anciennes données ======================= */
  await t.test("compat: un calepinage et un devis sans les nouveaux champs (kind, mlOn…) se chargent sans erreur", async () => {
    const p = await newPage();
    const legacy = {
      app: "etabli", version: 1, exportedAt: null,
      data: {
        settings: null,
        catalogue: [],
        calepinage: {
          materials: [{ id: "m1", material: "Ancien MDF", pricePerM2: "20", panelW: "2500", panelH: "1250", kerf: "3", grainDirection: false,
            pieces: [{ id: "p1", label: "Côté", w: "600", h: "400", qty: "2", color: "#A8631F" }] }],
          activeId: "m1",
        },
        quotes: [{ id: "q_old", numero: "DEV-2025-007", dateISO: "2025-05-01", client: { nom: "Ancien client", adresse: "", email: "", tel: "" },
          chantier: "Ancien chantier en texte simple", clientType: "particulier", tvaRate: 6, tvaFournitures: "", remiseType: "eur", remiseVal: "",
          deplacement: "", deplacementCout: "", acompte: "30", validite: "30", conditions: "Conditions d'avant.",
          lines: [{ id: "l1", type: "fourniture", designation: "Vieille fourniture", detail: "3 x 2 m", showDetail: true, showQty: true, qte: "4", unite: "u", pa: "10", marge: "20", tvaRate: "" }] }],
      },
    };
    const file = path.join(os.tmpdir(), "etabli-legacy.json");
    fs.writeFileSync(file, JSON.stringify(legacy));
    await p.click('button:has-text("Réglages")');
    await p.waitForSelector("text=Sauvegarde des données");
    await p.locator(".reglages-file").setInputFiles(file);
    await p.waitForTimeout(250);

    // le calepinage d'avant est un panneau, avec ses pièces
    await p.click('button:has-text("Calepinage")');
    await p.waitForSelector(".cl");
    assert.equal(await p.locator('.cl .grid:has-text("Longueur panneau")').count(), 1, "matériau hérité = panneau");
    assert.match(await p.locator(".cl-stats").innerText(), /PANNEAUX À ACHETER[\s\S]*\b1\b/i);
    await p.keyboard.press("Escape");

    // le devis d'avant se charge et se calcule comme avant (4 × 10 € + 20 % = 48 €)
    await p.click('button:has-text("Mes devis")');
    await p.waitForSelector(".qrow");
    await p.click(".qrow .btn:has-text('Charger')");
    await p.waitForSelector(".line");
    assert.equal(await p.locator(".line .ml-toggle input").isChecked(), false);
    assert.equal(await p.locator(".line").getByText("Quantité (métré)").locator("..").locator("input").inputValue(), "4");
    assert.match(await p.locator(".line-figs").innerText(), /Vente HTVA\s+48,00/);
    await p.click('button:has-text("Devis client")');
    await p.waitForSelector(".s-table");
    assert.match(await p.locator(".s-parties").innerText(), /Ancien chantier en texte simple/);
    assert.match(await p.locator(".s-detail").innerText(), /3 x 2 m/);
    assert.match(await p.locator(".s-cond").innerText(), /Conditions d'avant\./);
    assert.deepEqual(p._errors, []);
    await p.close();
  });
});
