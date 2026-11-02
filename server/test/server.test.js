"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { boot, client, quote } = require("../testlib/helpers.js");

async function withServer(fn, opts) {
  const s = await boot(opts);
  try { await fn(s); } finally { await s.close(); }
}
async function loggedIn(s, login = "paul", pw = "motdepasse-solide") {
  try { await s.app.users.add(login, pw); } catch (e) { if (!/existe/.test(e.message)) throw e; }
  const c = client(s.base);
  const r = await c.post("/api/login", { login, password: pw });
  assert.equal(r.status, 200, r.text);
  return c;
}

/* ---------------------------------------------------------------- statique */
test("statique: sert l'application, refuse tout le reste (traversée, tests, package.json, dossier parent)", () => withServer(async (s) => {
  const c = client(s.base);
  const idx = await c.get("/");
  assert.equal(idx.status, 200);
  assert.match(idx.headers.get("content-type"), /text\/html/);
  assert.match(idx.text, /ÉTABLI/);
  assert.equal((await c.get("/lib/etabli-core.js")).status, 200);
  assert.equal((await c.get("/migrate.html")).status, 200);
  // requêtes BRUTES : fetch normalise « /lib/.. » avant l'envoi, ce qui masquerait le test
  const rawGet = (p) => new Promise((resolve, reject) => {
    require("node:http").get({ host: "127.0.0.1", port: new URL(s.base).port, path: p }, (res) => {
      let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve({ status: res.statusCode, text: t }));
    }).on("error", reject);
  });
  for (const bad of [
    "/../server/server.js", "/lib/../../server/server.js", "/%2e%2e/server/server.js", "/lib/%2e%2e/%2e%2e/server/app.js",
    "/..%2fserver%2fapp.js", "/test/core.test.js", "/package.json", "/README.md", "/lib/", "/index.html%00.js",
    "/lib/etabli-core.js/../../package.json", "/%5c..%5cserver%5capp.js",
  ]) {
    const r = await rawGet(bad);
    assert.ok(r.status === 404 || r.status === 400, `${bad} → ${r.status}`);
    assert.doesNotMatch(r.text, /createApp|etabli-server/, `${bad} ne doit rien révéler`);
  }
  // « /lib/.. » est résolu en « / » par l'analyse d'URL : on retombe sur la page d'accueil, jamais hors du dossier
  const dots = await rawGet("/lib/..");
  assert.equal(dots.status, 200);
  assert.doesNotMatch(dots.text, /createApp/);
}));

test("en-têtes de sécurité sur chaque réponse (CSP, nosniff, anti-framing) ; HSTS seulement en HTTPS", () => withServer(async (s) => {
  const r = await client(s.base).get("/");
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'.*frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("strict-transport-security"), null, "pas de HSTS quand COOKIE_SECURE=0");
  const api = await client(s.base).get("/api/health");
  assert.equal(api.headers.get("cache-control"), "no-store");
  await withServer(async (s2) => {
    assert.match((await client(s2.base).get("/")).headers.get("strict-transport-security"), /max-age=\d+/);
  }, { cfg: { cookieSecure: true } });
}));

/* ---------------------------------------------------------------- authentification */
test("auth: toute l'API (sauf santé/connexion) exige une session", () => withServer(async (s) => {
  const c = client(s.base);
  assert.equal((await c.get("/api/health")).status, 200);
  for (const [m, u, b] of [["GET", "/api/me"], ["GET", "/api/data"], ["PUT", "/api/settings", { value: {} }], ["PUT", "/api/quotes/q1", { quote: quote({ id: "q1" }) }],
    ["DELETE", "/api/quotes/q1"], ["POST", "/api/import", { backup: {} }], ["POST", "/api/migrated", {}]]) {
    const r = await c.raw(m, u, b);
    assert.equal(r.status, 401, `${m} ${u}`);
  }
}));

test("auth: mauvais identifiants → 401 générique (même message login inconnu / mot de passe faux)", () => withServer(async (s) => {
  await s.app.users.add("paul", "motdepasse-solide");
  const c = client(s.base);
  const a = await c.post("/api/login", { login: "paul", password: "faux" });
  const b = await c.post("/api/login", { login: "inconnu", password: "faux" });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.text, b.text, "aucune différence permettant d'énumérer les comptes");
  assert.equal(a.setCookie.length, 0);
  assert.equal((await c.post("/api/login", { login: "paul" })).status, 401, "sans mot de passe");
  assert.equal((await c.post("/api/login", { login: "paul", password: "x".repeat(5000) })).status, 401);
}));

test("auth: connexion → cookie HttpOnly SameSite=Lax (+ Secure en HTTPS), /api/me, déconnexion", () => withServer(async (s) => {
  const c = await loggedIn(s);
  const me = await c.get("/api/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.login, "paul");
  assert.equal(me.json.migrated, false);
  await withServer(async (s2) => {
    await s2.app.users.add("paul", "motdepasse-solide");
    const r = await client(s2.base).post("/api/login", { login: "Paul ", password: "motdepasse-solide" }); // casse/espaces tolérés sur le login
    assert.equal(r.status, 200);
    const cookie = r.setCookie[0];
    assert.match(cookie, /^etabli_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /Path=\//);
  }, { cfg: { cookieSecure: true } });
  const out = await c.post("/api/logout");
  assert.equal(out.status, 200);
  assert.match(out.setCookie[0], /Max-Age=0/);
  assert.equal((await c.get("/api/me")).status, 401, "cookie effacé");
}));

test("auth: cookie falsifié, tronqué, expiré ou signé avec une autre clé → refusé", () => withServer(async (s) => {
  const Auth = require("../lib/auth.js");
  const c = await loggedIn(s);
  const good = c.cookie.split("=")[1];
  const c2 = client(s.base);
  for (const bad of [good.slice(0, -2) + "xx", good + "a", "n'importe quoi", good.split(".")[0], "." + good.split(".")[1], ""]) {
    c2.cookie = "etabli_session=" + encodeURIComponent(bad);
    assert.equal((await c2.get("/api/me")).status, 401, bad.slice(0, 30));
  }
  const alien = Auth.signSession(Buffer.alloc(32, 7), { login: "paul", epoch: 1 }, 60000);
  c2.cookie = "etabli_session=" + alien;
  assert.equal((await c2.get("/api/me")).status, 401, "autre clé");
  const expired = Auth.signSession(await Auth.loadSecret(s.dir), { login: "paul", epoch: 1 }, 1000, Date.now() - 60000);
  c2.cookie = "etabli_session=" + expired;
  assert.equal((await c2.get("/api/me")).status, 401, "expiré");
  // une session valide pour un compte qui n'existe pas (ou plus) est refusée
  const ghost = Auth.signSession(await Auth.loadSecret(s.dir), { login: "fantome", epoch: 1 }, 60000);
  c2.cookie = "etabli_session=" + ghost;
  assert.equal((await c2.get("/api/me")).status, 401, "compte inexistant");
}));

test("auth: « revoke » et « passwd » invalident les sessions existantes", () => withServer(async (s) => {
  const c = await loggedIn(s);
  assert.equal((await c.get("/api/me")).status, 200);
  await s.app.users.revoke("paul");
  assert.equal((await c.get("/api/me")).status, 401, "après revoke");
  const c2 = await loggedIn(s);
  await s.app.users.setPassword("paul", "nouveau-mot-de-passe");
  assert.equal((await c2.get("/api/me")).status, 401, "après changement de mot de passe");
  assert.equal((await client(s.base).post("/api/login", { login: "paul", password: "motdepasse-solide" })).status, 401);
  assert.equal((await client(s.base).post("/api/login", { login: "paul", password: "nouveau-mot-de-passe" })).status, 200);
}));

test("auth: 5 échecs → verrouillage (429 + Retry-After), même avec le bon mot de passe ; autre login non touché", () => withServer(async (s) => {
  await s.app.users.add("paul", "motdepasse-solide");
  await s.app.users.add("marie", "autre-mot-de-passe");
  const c = client(s.base);
  for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/login", { login: "paul", password: "faux" + i })).status, 401);
  const locked = await c.post("/api/login", { login: "paul", password: "motdepasse-solide" });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  assert.equal((await c.post("/api/login", { login: "marie", password: "autre-mot-de-passe" })).status, 200, "le verrou est par compte (et par IP)");
}));

test("auth: IP réelle lue dans CF-Connecting-IP uniquement si TRUST_PROXY=cf", async () => {
  await withServer(async (s) => {
    await s.app.users.add("paul", "motdepasse-solide");
    const c = client(s.base);
    for (let i = 0; i < 5; i++) await c.post("/api/login", { login: "paul", password: "x" }, { "CF-Connecting-IP": "203.0.113.9" });
    const sameIp = await c.post("/api/login", { login: "paul", password: "motdepasse-solide" }, { "CF-Connecting-IP": "203.0.113.9" });
    assert.equal(sameIp.status, 429, "verrouillé pour cette IP");
    // le verrou est par (IP, login) : une autre IP cliente légitime n'est pas bloquée par l'attaquant
    const other = await c.post("/api/login", { login: "paul", password: "motdepasse-solide" }, { "CF-Connecting-IP": "198.51.100.1" });
    assert.equal(other.status, 200);
  }, { cfg: { trustProxy: "cf" } });
  await withServer(async (s) => {
    await s.app.users.add("paul", "motdepasse-solide");
    const c = client(s.base);
    for (let i = 0; i < 5; i++) await c.post("/api/login", { login: "paul", password: "x" }, { "CF-Connecting-IP": "203.0.113." + i });
    // sans confiance dans le proxy, l'en-tête est ignoré : changer d'IP annoncée ne contourne pas le verrou
    assert.equal((await c.post("/api/login", { login: "paul", password: "motdepasse-solide" }, { "CF-Connecting-IP": "198.51.100.77" })).status, 429);
  });
});

/* ---------------------------------------------------------------- CSRF / entrées */
test("CSRF: Origin étranger, Sec-Fetch-Site cross-site ou Content-Type non JSON → refusé", () => withServer(async (s) => {
  const c = await loggedIn(s);
  const q = { quote: quote({ id: "q_csrf" }), baseRev: null };
  assert.equal((await c.put("/api/quotes/q_csrf", q, { Origin: "http://evil.example" })).status, 403);
  assert.equal((await c.put("/api/quotes/q_csrf", q, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await c.post("/api/logout", {}, { Origin: "http://evil.example" })).status, 403);
  assert.equal((await c.post("/api/login", { login: "paul", password: "motdepasse-solide" }, { Origin: "http://evil.example" })).status, 403, "même la connexion");
  assert.equal((await c.raw("PUT", "/api/quotes/q_csrf", "quote=1", { "Content-Type": "application/x-www-form-urlencoded" })).status, 415);
  assert.equal((await c.raw("PUT", "/api/quotes/q_csrf", "{pas du json", { "Content-Type": "application/json" })).status, 400);
  // même origine : accepté
  assert.equal((await c.put("/api/quotes/q_csrf", q, { Origin: s.base, "Sec-Fetch-Site": "same-origin" })).status, 200);
  assert.deepEqual((await c.get("/api/data")).json.quotes.map((x) => x.id), ["q_csrf"], "une seule écriture est passée");
}));

test("corps trop volumineux → 413, rien n'est écrit", () => withServer(async (s) => {
  const c = await loggedIn(s);
  const big = quote({ id: "q_big", chantier: "x".repeat(300 * 1024) });
  const r = await c.put("/api/quotes/q_big", { quote: big, baseRev: null });
  assert.equal(r.status, 413);
  assert.equal((await c.get("/api/data")).json.quotes.length, 0);
}, { cfg: { maxBody: 200 * 1024 } }));

/* ---------------------------------------------------------------- devis */
test("devis: création (rev 1), mise à jour avec la bonne révision (rev 2), relecture", () => withServer(async (s) => {
  const c = await loggedIn(s);
  const r1 = await c.put("/api/quotes/q_test_1", { quote: quote(), baseRev: null });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.rev, 1);
  const r2 = await c.put("/api/quotes/q_test_1", { quote: quote({ chantier: "modifié" }), baseRev: 1 });
  assert.equal(r2.json.rev, 2);
  const d = (await c.get("/api/data")).json;
  assert.equal(d.quotes.length, 1);
  assert.equal(d.quotes[0].chantier, "modifié");
  assert.equal(d.quotes[0]._rev, 2);
}));

test("devis: conflit détecté (révision périmée, ou « je crée » alors qu'il existe) → 409 sans rien écraser", () => withServer(async (s) => {
  const c = await loggedIn(s);
  await c.put("/api/quotes/q_test_1", { quote: quote(), baseRev: null });
  await c.put("/api/quotes/q_test_1", { quote: quote({ chantier: "appareil A" }), baseRev: 1 });
  const stale = await c.put("/api/quotes/q_test_1", { quote: quote({ chantier: "appareil B" }), baseRev: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.currentRev, 2);
  const again = await c.put("/api/quotes/q_test_1", { quote: quote({ chantier: "B2" }), baseRev: null });
  assert.equal(again.status, 409);
  assert.equal((await c.get("/api/data")).json.quotes[0].chantier, "appareil A", "la version de A est intacte");
}));

test("devis: deux écritures simultanées avec la même révision → une seule passe (verrou)", () => withServer(async (s) => {
  const c = await loggedIn(s);
  await c.put("/api/quotes/q_test_1", { quote: quote(), baseRev: null });
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => c.put("/api/quotes/q_test_1", { quote: quote({ chantier: "w" + i }), baseRev: 1 })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 7);
  assert.equal((await c.get("/api/data")).json.quotes[0]._rev, 2);
}));

test("devis: suppression (idempotente) ; un devis supprimé ailleurs peut être recréé (la saisie n'est pas perdue)", () => withServer(async (s) => {
  const c = await loggedIn(s);
  await c.put("/api/quotes/q_test_1", { quote: quote(), baseRev: null });
  assert.equal((await c.del("/api/quotes/q_test_1")).status, 200);
  assert.equal((await c.del("/api/quotes/q_test_1")).status, 200, "idempotent");
  assert.equal((await c.get("/api/data")).json.quotes.length, 0);
  const re = await c.put("/api/quotes/q_test_1", { quote: quote({ chantier: "saisie conservée" }), baseRev: 7 });
  assert.equal(re.status, 200);
  assert.equal(re.json.rev, 1);
}));

test("devis: identifiants dangereux refusés (traversée de répertoire), aucun fichier hors du dossier du compte", () => withServer(async (s) => {
  const c = await loggedIn(s);
  for (const id of ["..", ".", "..%2F..%2Fusers", "%2e%2e", "a%2Fb", "a%5Cb", ".cache", "x".repeat(200), "%00", "a b"]) {
    const r = await c.put("/api/quotes/" + id, { quote: quote({ id: decodeURIComponentSafe(id) }), baseRev: null });
    assert.ok(r.status === 400 || r.status === 404, `${id} → ${r.status}`);
  }
  const mismatch = await c.put("/api/quotes/q_a", { quote: quote({ id: "q_b" }), baseRev: null });
  assert.equal(mismatch.status, 400, "l'id du corps doit correspondre à celui de l'URL");
  assert.equal((await c.put("/api/quotes/q_a", { quote: { id: "q_a" }, baseRev: null })).status, 400, "lignes manquantes");
  assert.equal((await c.put("/api/quotes/q_a", { quote: quote({ id: "q_a" }), baseRev: "1" })).status, 400, "baseRev non entier");
  const all = fs.readdirSync(s.dir, { recursive: true }).map(String);
  assert.ok(all.every((f) => !f.includes("..")), "rien d'écrit hors du dossier de données : " + all.join(","));
  assert.ok(!fs.existsSync(path.join(s.dir, "..", "users.json")));
}));
function decodeURIComponentSafe(x) { try { return decodeURIComponent(x); } catch (_) { return x; } }

test("devis: le client ne peut pas fixer _rev ; écritures atomiques (aucun fichier temporaire restant)", () => withServer(async (s) => {
  const c = await loggedIn(s);
  await c.put("/api/quotes/q_test_1", { quote: quote({ _rev: 999 }), baseRev: null });
  const d = (await c.get("/api/data")).json;
  assert.equal(d.quotes[0]._rev, 1, "la révision est celle du serveur");
  const files = fs.readdirSync(path.join(s.dir, "accounts", "paul", "quotes"));
  assert.deepEqual(files, ["q_test_1.json"], "pas de .tmp restant");
  const onDisk = JSON.parse(fs.readFileSync(path.join(s.dir, "accounts", "paul", "quotes", "q_test_1.json"), "utf8"));
  assert.equal(onDisk.rev, 1);
  assert.equal(onDisk.quote._rev, undefined);
}));

test("documents: réglages, calepinage et catalogue (formats vérifiés)", () => withServer(async (s) => {
  const c = await loggedIn(s);
  assert.equal((await c.put("/api/settings", { value: { company: { nom: "X" }, params: { tvaRate: 6 } } })).status, 200);
  assert.equal((await c.put("/api/calepinage", { value: { materials: [], activeId: null } })).status, 200);
  assert.equal((await c.put("/api/catalogue", { value: [{ id: "c1", designation: "MDF" }] })).status, 200);
  assert.equal((await c.put("/api/catalogue", { value: { pas: "un tableau" } })).status, 400);
  assert.equal((await c.put("/api/settings", { value: [1, 2] })).status, 400);
  assert.equal((await c.put("/api/settings", {})).status, 400);
  const d = (await c.get("/api/data")).json;
  assert.equal(d.settings.company.nom, "X");
  assert.deepEqual(d.catalogue, [{ id: "c1", designation: "MDF" }]);
  assert.deepEqual(d.calepinage, { materials: [], activeId: null });
}));

test("comptes: les données d'un compte sont invisibles et inaccessibles pour un autre", () => withServer(async (s) => {
  const a = await loggedIn(s, "paul", "motdepasse-solide");
  const b = await loggedIn(s, "marie", "autre-mot-de-passe");
  await a.put("/api/quotes/q_paul", { quote: quote({ id: "q_paul" }), baseRev: null });
  assert.equal((await b.get("/api/data")).json.quotes.length, 0);
  await b.del("/api/quotes/q_paul");
  assert.equal((await a.get("/api/data")).json.quotes.length, 1, "la suppression de b ne touche pas a");
  assert.equal((await b.put("/api/quotes/q_paul", { quote: quote({ id: "q_paul", chantier: "b" }), baseRev: null })).status, 200, "b crée SON devis du même id");
  assert.equal((await a.get("/api/data")).json.quotes[0].chantier, "", "celui de a est intact");
}));

test("persistance: après un redémarrage, les données et la session (clé secrète) sont conservées", async () => {
  const s1 = await boot();
  const c = await loggedIn(s1);
  await c.put("/api/quotes/q_test_1", { quote: quote(), baseRev: null });
  const cookie = c.cookie;
  await s1.close();
  const s2 = await boot({ dataDir: s1.dir });
  try {
    const c2 = client(s2.base);
    c2.cookie = cookie;
    const me = await c2.get("/api/me");
    assert.equal(me.status, 200, "un redéploiement ne déconnecte personne");
    assert.equal((await c2.get("/api/data")).json.quotes.length, 1);
  } finally { await s2.close(); }
});

test("fichiers: dossier de données en 0700, secret et users.json en 0600", () => withServer(async (s) => {
  await loggedIn(s);
  const mode = (p) => (fs.statSync(p).mode & 0o777).toString(8);
  assert.equal(mode(s.dir), "700");
  assert.equal(mode(path.join(s.dir, "secret.key")), "600");
  assert.equal(mode(path.join(s.dir, "users.json")), "600");
  const users = fs.readFileSync(path.join(s.dir, "users.json"), "utf8");
  assert.doesNotMatch(users, /motdepasse-solide/, "jamais de mot de passe en clair");
  assert.match(users, /"hash"/);
}));

/* ---------------------------------------------------------------- import additif (migration) */
const backup = (over) => ({
  app: "etabli", version: 1, exportedAt: null,
  data: {
    settings: { company: { nom: "Menuiserie X" }, params: { tvaRate: 6 } },
    quotes: [quote({ id: "q_a", numero: "DEV-1" }), quote({ id: "q_b", numero: "DEV-2" })],
    calepinage: { materials: [{ id: "m1" }], activeId: "m1" },
    catalogue: [{ id: "c1", designation: "MDF 18", pa: "30" }, { id: "c2", designation: "Chêne", pa: "90" }],
    ...(over || {}),
  },
});

test("import: première migration — tout est ajouté, le compte est marqué « migré »", () => withServer(async (s) => {
  const c = await loggedIn(s);
  assert.equal((await c.get("/api/me")).json.migrated, false);
  const r = await c.post("/api/import", { backup: backup() });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.quotes, { added: 2, duplicates: 0, copies: 0, skipped: 0 });
  assert.equal(r.json.catalogue.added, 2);
  assert.equal(r.json.settings, true);
  assert.equal(r.json.calepinage, true);
  const d = (await c.get("/api/data")).json;
  assert.equal(d.quotes.length, 2);
  assert.equal(d.migrated, true);
  assert.equal(d.settings.company.nom, "Menuiserie X");
  assert.equal((await c.get("/api/me")).json.migrated, true);
}));

test("import: ADDITIF — rejouer ne duplique rien, un devis modifié devient une copie, l'existant n'est jamais écrasé", () => withServer(async (s) => {
  const c = await loggedIn(s);
  await c.post("/api/import", { backup: backup() });
  // on modifie un devis côté serveur, ainsi que le catalogue et les réglages
  const cur = (await c.get("/api/data")).json.quotes.find((q) => q.id === "q_a");
  await c.put("/api/quotes/q_a", { quote: { ...cur, chantier: "modifié sur le serveur" }, baseRev: cur._rev });
  await c.put("/api/settings", { value: { company: { nom: "Réglé sur le serveur" } } });
  await c.put("/api/catalogue", { value: [{ id: "c1", designation: "mdf  18", pa: "99" }] });

  const again = await c.post("/api/import", { backup: backup({ quotes: [quote({ id: "q_a", numero: "DEV-1" }), quote({ id: "q_b", numero: "DEV-2" }), quote({ id: "q_c", numero: "DEV-3" })] }) });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json.quotes, { added: 1, duplicates: 1, copies: 1, skipped: 0 }, "q_c ajouté, q_b identique ignoré, q_a (différent) copié");
  assert.equal(again.json.catalogue.added, 1, "« Chêne » ajouté ; « MDF 18 » existe déjà (désignation normalisée)");
  assert.equal(again.json.settings, false, "réglages déjà présents : conservés");
  assert.equal(again.json.calepinage, false);
  const d = (await c.get("/api/data")).json;
  assert.equal(d.quotes.length, 4);
  assert.equal(d.quotes.find((q) => q.id === "q_a").chantier, "modifié sur le serveur", "l'original n'est pas écrasé");
  assert.equal(d.settings.company.nom, "Réglé sur le serveur");
  assert.equal(d.catalogue.find((x) => x.id === "c1").pa, "99", "l'existant prime dans le catalogue");
  assert.equal(d.catalogue.length, 2);
}));

test("import: devis sans id / id dangereux → id régénéré ; devis inutilisables ignorés ; _rev entrant ignoré", () => withServer(async (s) => {
  const c = await loggedIn(s);
  const r = await c.post("/api/import", { backup: backup({ quotes: [
    { ...quote({ id: "../../evil" }), numero: "A" }, { ...quote({ numero: "B" }), id: undefined }, quote({ id: "ok_1", _rev: 50 }),
    "pas un devis", { id: "sans_lignes" },
  ], catalogue: [], settings: null, calepinage: null }) });
  assert.equal(r.status, 200);
  assert.equal(r.json.quotes.added, 3);
  assert.equal(r.json.quotes.skipped, 2);
  const d = (await c.get("/api/data")).json;
  assert.ok(d.quotes.every((q) => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(q.id)), d.quotes.map((q) => q.id).join(","));
  assert.equal(d.quotes.find((q) => q.id === "ok_1")._rev, 1);
  assert.ok(!fs.existsSync(path.join(s.dir, "evil.json")));
}));

test("import: fichier qui n'est pas une sauvegarde Établi → 400 clair, rien d'écrit, compte non marqué", () => withServer(async (s) => {
  const c = await loggedIn(s);
  for (const b of [{}, { app: "autre", data: {} }, "texte", null]) {
    const r = await c.post("/api/import", { backup: b });
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.match(r.json.error, /sauvegarde Établi/);
  }
  assert.equal((await c.get("/api/data")).json.migrated, false);
}));

test("import: « passer » (POST /api/migrated) marque le compte sans importer", () => withServer(async (s) => {
  const c = await loggedIn(s);
  await c.post("/api/migrated", {});
  const d = (await c.get("/api/data")).json;
  assert.equal(d.migrated, true);
  assert.equal(d.quotes.length, 0);
}));

test("/api/me expose l'ancienne adresse configurée (pour la migration)", () => withServer(async (s) => {
  const c = await loggedIn(s);
  assert.equal((await c.get("/api/me")).json.legacyUrl, "https://ancien.example/devjs/");
}, { cfg: { legacyUrl: "https://ancien.example/devjs/" } }));

/* ---------------------------------------------------------------- administration (CLI) */
test("admin: add / passwd / revoke / list, mot de passe généré affiché une fois", async () => {
  const admin = require("../admin.js");
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "etabli-adm-"));
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    assert.equal(await admin.main(["add", "client"], { DATA_DIR: dir }), 0);
    const pw = /mot de passe : (\S+)/.exec(logs.join("\n"))[1];
    assert.ok(pw.length >= 20, "mot de passe généré assez long");
    assert.equal(await admin.main(["list"], { DATA_DIR: dir }), 0);
    assert.ok(logs.includes("client"));
    const s = await boot({ dataDir: dir });
    try {
      assert.equal((await client(s.base).post("/api/login", { login: "client", password: pw })).status, 200);
    } finally { await s.close(); }
    await assert.rejects(() => admin.main(["add", "client"], { DATA_DIR: dir }), /existe déjà/);
    await assert.rejects(() => admin.main(["add", "Bad Login"], { DATA_DIR: dir }), /login invalide/);
    await assert.rejects(() => admin.main(["add", "court", "--password", "abc"], { DATA_DIR: dir }), /trop court/);
    assert.equal(await admin.main(["passwd", "client", "--password", "nouveau-mdp-123"], { DATA_DIR: dir }), 0);
    assert.equal(await admin.main(["revoke", "client"], { DATA_DIR: dir }), 0);
    assert.equal(await admin.main([], { DATA_DIR: dir }), 2);
  } finally { console.log = orig; }
});
