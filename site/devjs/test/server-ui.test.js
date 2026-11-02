"use strict";
/* Tests navigateur (Playwright) de l'application servie PAR LE SERVEUR ÉTABLI : connexion, devis
   enregistrés en fichiers côté serveur, conflits, session expirée, migration depuis « l'ancienne
   adresse » (une seconde origine servant l'application en mode navigateur seul). */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { chromium = null; }
let createApp;
try { ({ createApp } = require("../../../server/app.js")); } catch (_) { createApp = null; }

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript" };

// « Ancienne adresse » : sert l'application seule (pas d'API → mode navigateur) ; la liste des
// origines autorisées à recevoir les données (migrate-config.js) est réglable par le test.
function startLegacyServer(state) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    if (rel === "/migrate-config.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end("window.ETABLI_MIGRATE_TARGETS = " + JSON.stringify(state.targets) + ";");
    }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || rel.startsWith("/test") || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
async function startAppServer(legacyUrl) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "etabli-uisrv-"));
  const app = createApp({ dataDir, staticDir: ROOT, cookieSecure: false, log: false, legacyUrl });
  await app.ready;
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { app, server, dataDir, base: "http://127.0.0.1:" + server.address().port };
}

test("UI serveur", { skip: !chromium ? "playwright non installé" : !createApp ? "serveur introuvable" : false }, async (t) => {
  const legacyState = { targets: [] };
  const legacy = await startLegacyServer(legacyState);
  const legacyBase = "http://127.0.0.1:" + legacy.address().port;

  const execPath = process.env.PW_EXECUTABLE_PATH;
  const browser = await chromium.launch(execPath ? { executablePath: execPath } : {});
  const vendorDir = process.env.PW_VENDOR_DIR;
  const mkContext = async () => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 900 } });
    if (vendorDir) {
      await ctx.route(/unpkg\.com|jsdelivr\.net/, (route) => {
        const u = route.request().url();
        const file = /react-dom/.test(u) ? "react-dom.js" : /react/.test(u) ? "react.js" : /babel/.test(u) ? "babel.js" : null;
        if (file) return route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(vendorDir, file)) });
        return route.continue();
      });
    }
    return ctx;
  };
  t.after(async () => { await browser.close(); legacy.close(); });

  const PW = "motdepasse-solide";
  // Prépare : serveur d'application neuf + un compte ; rend aussi un « ouvre une page » aux erreurs suivies.
  async function setup(opts = {}) {
    const srv = await startAppServer(opts.noLegacy ? "" : legacyBase + "/");
    await srv.app.users.add("paul", PW);
    legacyState.targets = opts.targets === undefined ? [srv.base] : opts.targets;
    const ctx = opts.ctx || (await mkContext());
    const open = async (login = true) => {
      const p = await ctx.newPage();
      p._errors = [];
      p.on("pageerror", (e) => p._errors.push(e.message));
      p.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) p._errors.push(m.text()); });
      await p.goto(srv.base + "/", { waitUntil: "load", timeout: 45000 });
      if (login) await loginUI(p);
      return p;
    };
    return { srv, ctx, open, close: async () => { await ctx.close(); await new Promise((r) => srv.server.close(r)); } };
  }
  async function loginUI(p, login = "paul", pw = PW) {
    await p.waitForSelector('input[name="login"]', { timeout: 30000 });
    await p.fill('input[name="login"]', login);
    await p.fill('input[name="password"]', pw);
    await p.click('button:has-text("Se connecter")');
  }
  const ready = (p) => p.waitForSelector('button:has-text("Enregistrer")', { timeout: 30000 });
  const clientField = (p) => p.locator('label.fld:has(span.fld-lab:text-is("Client")) input');
  const quoteFiles = (srv) => { try { return fs.readdirSync(path.join(srv.dataDir, "accounts", "paul", "quotes")); } catch (_) { return []; } };

  await t.test("connexion: écran de connexion, mauvais mot de passe refusé, puis l'application avec le compte affiché", async () => {
    const s = await setup({ noLegacy: true });
    try {
      const p = await s.open(false);
      await p.waitForSelector('input[name="login"]');
      assert.equal(await p.locator('button:has-text("Enregistrer")').count(), 0, "l'application n'est pas accessible sans connexion");
      await loginUI(p, "paul", "faux");
      await p.waitForSelector(".login-err");
      assert.match(await p.locator(".login-err").innerText(), /incorrect/i);
      await p.fill('input[name="password"]', PW);
      await p.click('button:has-text("Se connecter")');
      await ready(p);
      assert.equal((await p.locator(".bar-user").innerText()).trim(), "paul");
      assert.equal(await p.locator('button:has-text("Déconnexion")').count(), 1);
      assert.deepEqual(p._errors, [], "aucune erreur JS ni violation de la CSP du serveur");
    } finally { await s.close(); }
  });

  await t.test("persistance serveur: un devis enregistré devient un FICHIER, survit au rechargement, la déconnexion le protège", async () => {
    const s = await setup({ noLegacy: true });
    try {
      let p = await s.open();
      await ready(p);
      await clientField(p).fill("Alice");
      await p.click('button:has-text("Enregistrer")');
      await p.waitForTimeout(400);
      assert.equal(quoteFiles(s.srv).length, 1, "un fichier par devis sur le serveur");
      const onDisk = JSON.parse(fs.readFileSync(path.join(s.srv.dataDir, "accounts", "paul", "quotes", quoteFiles(s.srv)[0]), "utf8"));
      assert.equal(onDisk.quote.client.nom, "Alice");
      assert.equal(onDisk.rev, 1);

      // rechargement : toujours connecté (cookie), le devis est chargé depuis le serveur
      await p.reload();
      await ready(p);
      await p.click('button:has-text("Mes devis")');
      await p.waitForSelector(".qrow");
      assert.match(await p.locator(".qrow-meta").first().innerText(), /Alice/);
      assert.equal(await p.evaluate(() => localStorage.getItem("etabli:quotes")), null, "plus rien dans le localStorage en mode serveur");

      // on rouvre le devis (« Charger ») puis on le ré-enregistre → révision 2, toujours un seul fichier
      await p.click('.qrow .btn:has-text("Charger")');
      await p.waitForTimeout(200);
      await clientField(p).fill("Alice v2");
      await p.click('button:has-text("Enregistrer")');
      await p.waitForTimeout(400);
      assert.equal(quoteFiles(s.srv).length, 1);
      assert.equal(JSON.parse(fs.readFileSync(path.join(s.srv.dataDir, "accounts", "paul", "quotes", quoteFiles(s.srv)[0]), "utf8")).rev, 2);

      // suppression → fichier supprimé
      await p.click('button:has-text("Mes devis")');
      await p.waitForSelector(".qrow");
      await p.click(".qrow .btn.danger");
      await p.waitForTimeout(400);
      assert.equal(quoteFiles(s.srv).length, 0);

      // déconnexion → écran de connexion, et il le reste après rechargement
      await p.keyboard.press("Escape");
      await p.click('button:has-text("Déconnexion")');
      await p.waitForSelector('input[name="login"]');
      await p.reload();
      await p.waitForSelector('input[name="login"]');
      assert.equal(await p.locator('button:has-text("Enregistrer")').count(), 0);
      assert.deepEqual(p._errors, []);
    } finally { await s.close(); }
  });

  await t.test("persistance serveur: réglages, catalogue et calepinage aussi", async () => {
    const s = await setup({ noLegacy: true });
    try {
      let p = await s.open();
      await ready(p);
      // réglages
      await p.click('button:has-text("Réglages")');
      await p.waitForSelector("text=Sauvegarde des données");
      await p.locator('label.fld:has(span.fld-lab:text-is("Nom")) input').fill("Menuiserie Test SRL");
      await p.click('button:has-text("Enregistrer les réglages")');
      // catalogue
      await p.click('button.add:has-text("Fourniture")');
      await p.locator(".line .line-title").fill("Charnière invisible");
      await p.locator(".line").getByText("Prix d'achat / u", { exact: true }).locator("..").locator("input").fill("4,2");
      await p.locator(".line .ico-cat").click();
      // calepinage
      await p.click('button:has-text("Calepinage")');
      await p.waitForSelector(".cl");
      await p.locator(".cl .grid").getByText("Matière / désignation").locator("..").locator("input").fill("MDF serveur");
      await p.click('button.add:has-text("Ajouter une pièce")');
      await p.waitForTimeout(1200); // temporisation d'écriture du calepinage

      await p.reload();
      await ready(p);
      await p.click('button:has-text("Réglages")');
      await p.waitForSelector("text=Sauvegarde des données");
      assert.equal(await p.locator('label.fld:has(span.fld-lab:text-is("Nom")) input').inputValue(), "Menuiserie Test SRL");
      await p.keyboard.press("Escape");
      assert.match(await p.locator('button:has-text("Catalogue")').first().innerText(), /\(1\)/);
      await p.click('button:has-text("Calepinage")');
      await p.waitForSelector(".cl");
      assert.equal(await p.locator(".cl .grid").getByText("Matière / désignation").locator("..").locator("input").inputValue(), "MDF serveur");
      assert.equal(await p.locator(".cl-prow:not(.cl-prow-head)").count(), 1);
      assert.deepEqual(p._errors, []);
    } finally { await s.close(); }
  });

  await t.test("conflit: deux appareils modifient le même devis → le 2ᵉ est averti, la version du 1ᵉʳ n'est PAS écrasée", async () => {
    const s = await setup({ noLegacy: true });
    try {
      const a = await s.open();
      await ready(a);
      await clientField(a).fill("Version initiale");
      await a.click('button:has-text("Enregistrer")');
      await a.waitForTimeout(400);

      const ctxB = await mkContext();            // « autre appareil » : contexte séparé, même compte
      const pageB = await ctxB.newPage();
      await pageB.goto(s.srv.base + "/", { waitUntil: "load" });
      await loginUI(pageB);
      await ready(pageB);
      await pageB.click('button:has-text("Mes devis")');
      await pageB.waitForSelector(".qrow");
      await pageB.click('.qrow .btn:has-text("Charger")');
      await pageB.waitForTimeout(200);

      await clientField(a).fill("Modifié par A");
      await a.click('button:has-text("Enregistrer")');
      await a.waitForTimeout(400);

      await clientField(pageB).fill("Modifié par B");
      await pageB.click('button:has-text("Enregistrer")');
      await pageB.waitForSelector(".syncbar");
      assert.match(await pageB.locator(".syncbar").innerText(), /modifié depuis un autre appareil/);
      assert.equal(await pageB.locator('.syncbar button:has-text("Recharger la page")').count(), 1);
      const onDisk = JSON.parse(fs.readFileSync(path.join(s.srv.dataDir, "accounts", "paul", "quotes", quoteFiles(s.srv)[0]), "utf8"));
      assert.equal(onDisk.quote.client.nom, "Modifié par A", "la version de A n'est pas écrasée");

      await pageB.reload();
      await ready(pageB);
      await pageB.click('button:has-text("Mes devis")');
      await pageB.waitForSelector(".qrow");
      assert.match(await pageB.locator(".qrow-meta").first().innerText(), /Modifié par A/, "après rechargement, B voit la version de A");
      await ctxB.close();
    } finally { await s.close(); }
  });

  await t.test("session expirée en cours d'édition: connexion superposée, le travail en cours reste à l'écran, puis l'enregistrement passe", async () => {
    const s = await setup({ noLegacy: true });
    try {
      const p = await s.open();
      await ready(p);
      await clientField(p).fill("Travail en cours");
      await s.srv.app.users.revoke("paul"); // la session n'est plus valable
      await p.click('button:has-text("Enregistrer")');
      await p.waitForSelector(".login-overlay");
      assert.match(await p.locator(".login-overlay").innerText(), /session a expiré/i);
      assert.equal(await clientField(p).inputValue(), "Travail en cours", "l'édition en cours est conservée derrière la connexion");
      await p.locator(".login-overlay").locator('input[name="login"]').fill("paul");
      await p.locator(".login-overlay").locator('input[name="password"]').fill(PW);
      await p.locator(".login-overlay").locator('button:has-text("Se connecter")').click();
      await p.waitForSelector(".login-overlay", { state: "detached" });
      assert.equal(await clientField(p).inputValue(), "Travail en cours");
      await p.click('button:has-text("Enregistrer")');
      await p.waitForTimeout(500);
      assert.equal(quoteFiles(s.srv).length, 1, "le devis est enregistré après la reconnexion");
      assert.equal(await p.locator(".syncbar").count(), 0);
      assert.deepEqual(p._errors, []);
    } finally { await s.close(); }
  });

  await t.test("réseau coupé: bandeau d'avertissement, la saisie reste, le prochain « Enregistrer » réussi efface l'alerte", async () => {
    const s = await setup({ noLegacy: true });
    try {
      const p = await s.open();
      await ready(p);
      await clientField(p).fill("Hors ligne");
      await p.route("**/api/quotes/**", (route) => route.abort());
      await p.click('button:has-text("Enregistrer")');
      await p.waitForSelector(".syncbar");
      assert.match(await p.locator(".syncbar").innerText(), /injoignable/i);
      assert.equal(await clientField(p).inputValue(), "Hors ligne");
      assert.equal(quoteFiles(s.srv).length, 0);
      await p.unroute("**/api/quotes/**");
      await p.click('button:has-text("Enregistrer")');
      await p.waitForSelector(".syncbar", { state: "detached" });
      assert.equal(quoteFiles(s.srv).length, 1);
    } finally { await s.close(); }
  });

  /* ======================= migration depuis l'ancienne adresse ======================= */
  const legacyData = () => ({
    quotes: [
      { id: "q_old_1", numero: "DEV-2025-001", dateISO: "2025-06-01", client: { nom: "Ancien client 1", adresse: "", email: "", tel: "" }, chantier: "", clientType: "particulier", tvaRate: 6, tvaFournitures: "", remiseType: "eur", remiseVal: "", deplacement: "", deplacementCout: "", acompte: "30", validite: "30", conditions: "", lines: [{ id: "l1", type: "forfait", designation: "Forfait", pa: "100", marge: "10" }] },
      { id: "q_old_2", numero: "DEV-2025-002", dateISO: "2025-06-02", client: { nom: "Ancien client 2", adresse: "", email: "", tel: "" }, chantier: "", clientType: "particulier", tvaRate: 6, tvaFournitures: "", remiseType: "eur", remiseVal: "", deplacement: "", deplacementCout: "", acompte: "30", validite: "30", conditions: "", lines: [] },
    ],
    catalogue: [{ id: "c_old", designation: "MDF 18mm", pa: "30", unite: "m²", marge: "20", tvaRate: "" }],
    settings: { company: { nom: "Menuiserie Historique" }, params: { tvaRate: 6 } },
  });
  async function seedLegacy(ctx, data) {
    const p = await ctx.newPage();
    await p.goto(legacyBase + "/migrate-config.js"); // n'importe quelle page de l'origine : on y écrit le localStorage
    await p.evaluate((d) => {
      localStorage.setItem("etabli:quotes", JSON.stringify(d.quotes));
      localStorage.setItem("etabli:catalogue", JSON.stringify(d.catalogue));
      localStorage.setItem("etabli:settings", JSON.stringify(d.settings));
    }, data);
    await p.close();
  }

  await t.test("migration: à la 1re connexion, l'ancienne adresse envoie ses données (après confirmation) et le serveur les AJOUTE", async () => {
    const s = await setup();
    try {
      await seedLegacy(s.ctx, legacyData());
      const p = await s.open();
      await p.waitForSelector(".modal .migr-info, .modal:has-text(\"ancienne adresse\")", { timeout: 30000 });
      assert.match(await p.locator(".modal").innerText(), /ancienne adresse/i);
      const [popup] = await Promise.all([p.waitForEvent("popup"), p.click('button:has-text("Récupérer mes données")')]);
      await popup.waitForSelector("#act:not([hidden])", { timeout: 15000 });
      assert.equal(await popup.locator("#target").innerText(), s.srv.base, "la page affiche vers QUELLE adresse partiront les données");
      assert.match(await popup.locator("#msg").innerText(), /2 devis/);
      await popup.click("#send");
      await p.waitForSelector(".migr-done", { timeout: 15000 });
      assert.match(await p.locator(".migr-done").innerText(), /2 devis ajouté/);
      assert.equal(quoteFiles(s.srv).length, 2, "les devis sont des fichiers côté serveur");

      await p.click('.modal button:has-text("Fermer")');
      await p.click('button:has-text("Mes devis")');
      await p.waitForSelector(".qrow");
      const metas = (await p.locator(".qrow-meta").allInnerTexts()).join("\n");
      assert.match(metas, /Ancien client 1/);
      assert.match(metas, /Ancien client 2/);
      assert.match(await p.locator('button:has-text("Catalogue")').first().innerText(), /\(1\)/, "catalogue repris");
      await p.keyboard.press("Escape");
      await p.click('button:has-text("Réglages")');
      await p.waitForSelector("text=Sauvegarde des données");
      assert.equal(await p.locator('label.fld:has(span.fld-lab:text-is("Nom")) input').inputValue(), "Menuiserie Historique", "réglages repris (le serveur n'en avait pas)");
      await p.keyboard.press("Escape");

      // l'ancienne adresse n'a rien perdu
      const old = await s.ctx.newPage();
      await old.goto(legacyBase + "/migrate-config.js");
      assert.equal(JSON.parse(await old.evaluate(() => localStorage.getItem("etabli:quotes"))).length, 2, "rien n'est supprimé à l'ancienne adresse");
      await old.close();

      // reconnexion : la migration n'est plus proposée
      await p.reload();
      await ready(p);
      await p.waitForTimeout(400);
      assert.equal(await p.locator(".modal").count(), 0, "plus de proposition une fois migré");
      assert.deepEqual(p._errors, []);
    } finally { await s.close(); }
  });

  await t.test("migration: rejouée, elle est additive — aucun doublon, et ce que le serveur contient n'est pas écrasé", async () => {
    const s = await setup();
    try {
      await seedLegacy(s.ctx, legacyData());
      const p = await s.open();
      await p.waitForSelector('.modal:has-text("ancienne adresse")');
      let [popup] = await Promise.all([p.waitForEvent("popup"), p.click('button:has-text("Récupérer mes données")')]);
      await popup.waitForSelector("#act:not([hidden])");
      await popup.click("#send");
      await p.waitForSelector(".migr-done");
      await p.click('.modal button:has-text("Fermer")');

      // on modifie un devis migré sur le serveur
      await p.click('button:has-text("Mes devis")');
      await p.waitForSelector(".qrow");
      await p.locator(".qrow").filter({ hasText: "Ancien client 1" }).locator('.btn:has-text("Charger")').click();
      await clientField(p).fill("Modifié sur le serveur");
      await p.click('button:has-text("Enregistrer")');
      await p.waitForTimeout(400);

      // Réglages → « Récupérer mes données… » une 2ᵉ fois
      await p.click('button:has-text("Réglages")');
      await p.waitForSelector("text=Ancienne adresse");
      await p.click('button:has-text("Récupérer mes données…")');
      [popup] = await Promise.all([p.waitForEvent("popup"), p.click('.modal button:has-text("Récupérer mes données")')]);
      await popup.waitForSelector("#act:not([hidden])");
      await popup.click("#send");
      await p.waitForSelector(".migr-done");
      assert.match(await p.locator(".migr-done").innerText(), /1 ajouté\(s\) comme copie/, "le devis modifié devient une copie, il n'est pas écrasé");
      assert.match(await p.locator(".migr-done").innerText(), /1 déjà présent/);
      await p.click('.modal button:has-text("Fermer")');
      await p.click('button:has-text("Mes devis")');
      await p.waitForSelector(".qrow");
      const metas = (await p.locator(".qrow-meta").allInnerTexts()).join("\n");
      assert.match(metas, /Modifié sur le serveur/, "la version modifiée est intacte");
      assert.equal(await p.locator(".qrow").count(), 3, "2 migrés + 1 copie, aucun doublon du devis identique");
      assert.deepEqual(p._errors, []);
    } finally { await s.close(); }
  });

  await t.test("migration — sécurité: origine non autorisée ou migration non configurée → AUCUNE donnée n'est envoyée", async () => {
    const s = await setup({ targets: ["http://127.0.0.1:1"] }); // une autre origine que celle du serveur
    try {
      await seedLegacy(s.ctx, legacyData());
      const p = await s.open();
      await p.waitForSelector('.modal:has-text("ancienne adresse")');
      const [popup] = await Promise.all([p.waitForEvent("popup"), p.click('button:has-text("Récupérer mes données")')]);
      await popup.waitForSelector("#msg.err", { timeout: 15000 });
      assert.match(await popup.locator("#msg").innerText(), /pas autorisée/);
      assert.equal(await popup.locator("#send").isVisible(), false, "aucun bouton d'envoi");
      await p.waitForTimeout(500);
      assert.equal(quoteFiles(s.srv).length, 0, "rien n'a été envoyé au serveur");
      assert.equal(await p.locator(".migr-done").count(), 0);
      await popup.close();
    } finally { await s.close(); }
    const s2 = await setup({ targets: [] });
    try {
      await seedLegacy(s2.ctx, legacyData());
      const p = await s2.open();
      await p.waitForSelector('.modal:has-text("ancienne adresse")');
      const [popup] = await Promise.all([p.waitForEvent("popup"), p.click('button:has-text("Récupérer mes données")')]);
      await popup.waitForSelector("#msg.err");
      assert.match(await popup.locator("#msg").innerText(), /pas configurée/);
      await p.waitForTimeout(400);
      assert.equal(quoteFiles(s2.srv).length, 0);
      await popup.close();
    } finally { await s2.close(); }
  });

  await t.test("migration: annuler dans la fenêtre n'envoie rien ; « Je n'ai rien à récupérer » arrête les propositions", async () => {
    const s = await setup();
    try {
      await seedLegacy(s.ctx, legacyData());
      const p = await s.open();
      await p.waitForSelector('.modal:has-text("ancienne adresse")');
      const [popup] = await Promise.all([p.waitForEvent("popup"), p.click('button:has-text("Récupérer mes données")')]);
      await popup.waitForSelector("#act:not([hidden])");
      await popup.click("#cancel");
      await p.waitForSelector("text=Migration annulée");
      assert.equal(quoteFiles(s.srv).length, 0);
      await p.click('button:has-text("Je n\'ai rien à récupérer")');
      await p.waitForSelector(".modal", { state: "detached" });
      await p.reload();
      await ready(p);
      await p.waitForTimeout(400);
      assert.equal(await p.locator(".modal").count(), 0, "plus de proposition");
      // reste disponible dans Réglages
      await p.click('button:has-text("Réglages")');
      await p.waitForSelector("text=Ancienne adresse");
    } finally { await s.close(); }
  });

  await t.test("sans ancienne adresse configurée: aucune proposition de migration, aucun bouton", async () => {
    const s = await setup({ noLegacy: true });
    try {
      const p = await s.open();
      await ready(p);
      await p.waitForTimeout(400);
      assert.equal(await p.locator(".modal").count(), 0);
      await p.click('button:has-text("Réglages")');
      await p.waitForSelector("text=Sauvegarde des données");
      assert.equal(await p.locator("text=Ancienne adresse").count(), 0);
    } finally { await s.close(); }
  });

  await t.test("mot de passe: le menuisier le change dans Réglages ; erreur claire si l'ancien est faux ; l'ancien ne marche plus", async () => {
    const s = await setup({ noLegacy: true });
    try {
      const p = await s.open();
      await ready(p);
      await p.click('button:has-text("Réglages")');
      await p.waitForSelector("text=Mon compte");
      const f = (l) => p.locator(`label.fld:has(span.fld-lab:text-is("${l}")) input`);
      const btn = p.locator('button:has-text("Changer le mot de passe")');
      await f("Mot de passe actuel").fill("faux-mot-de-passe");
      await f("Nouveau mot de passe").fill("court");
      assert.equal(await btn.isDisabled(), true, "désactivé tant que le nouveau est trop court");
      await f("Nouveau mot de passe").fill("nouvelle phrase de passe");
      await f("Confirmer").fill("autre chose");
      assert.equal(await btn.isDisabled(), true, "désactivé si la confirmation diffère");
      await f("Confirmer").fill("nouvelle phrase de passe");
      await btn.click();
      await p.waitForSelector(".pw-err");
      assert.match(await p.locator(".pw-err").innerText(), /actuel incorrect/);
      await f("Mot de passe actuel").fill(PW);
      await btn.click();
      await p.waitForSelector(".pw-ok");
      // toujours connecté ici
      await p.keyboard.press("Escape");
      await p.reload();
      await ready(p);
      // l'ancien mot de passe ne fonctionne plus, le nouveau oui
      const ctx2 = await mkContext();
      const q = await ctx2.newPage();
      await q.goto(s.srv.base + "/");
      await loginUI(q, "paul", PW);
      await q.waitForSelector(".login-err");
      await q.fill('input[name="password"]', "nouvelle phrase de passe");
      await q.click('button:has-text("Se connecter")');
      await ready(q);
      await ctx2.close();
      assert.deepEqual(p._errors, []);
    } finally { await s.close(); }
  });
});
