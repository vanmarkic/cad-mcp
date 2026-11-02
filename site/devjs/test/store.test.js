"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../lib/etabli-store.js");

/* faux fetch : handler(method, url, body) → { status, json?, headers? } */
function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const r = await handler(method, url, body);
    const headers = new Map(Object.entries({ "content-type": "application/json", ...(r.headers || {}) }));
    return {
      status: r.status,
      headers: { get: (k) => headers.get(k.toLowerCase()) ?? null },
      text: async () => (r.text !== undefined ? r.text : r.json === undefined ? "" : JSON.stringify(r.json)),
      json: async () => r.json,
    };
  };
  f.calls = calls;
  return f;
}
const q = (id, extra) => ({ id, numero: "N-" + id, lines: [], ...(extra || {}) });

/* ------------------------------------------------------------ detectBackend */
test("detectBackend: 200 JSON → serveur connecté ; 401 JSON → serveur, à connecter", async () => {
  const ok = await S.detectBackend(fakeFetch(() => ({ status: 200, json: { login: "paul" } })));
  assert.deepEqual(ok, { mode: "server", authed: true, me: { login: "paul" } });
  const no = await S.detectBackend(fakeFetch(() => ({ status: 401, json: { error: "Non connecté" } })));
  assert.deepEqual(no, { mode: "server", authed: false, me: null });
});

test("detectBackend: 404, page HTML, erreur réseau, ou 401 non-JSON → mode local (GitHub Pages, fichier local…)", async () => {
  assert.equal((await S.detectBackend(fakeFetch(() => ({ status: 404, text: "<html>", headers: { "content-type": "text/html" } })))).mode, "local");
  assert.equal((await S.detectBackend(fakeFetch(() => ({ status: 200, text: "<html>", headers: { "content-type": "text/html" } })))).mode, "local");
  assert.equal((await S.detectBackend(fakeFetch(() => ({ status: 401, text: "x", headers: { "content-type": "text/plain" } })))).mode, "local", "un 401 d'un autre service n'est pas notre serveur");
  assert.equal((await S.detectBackend(async () => { throw new TypeError("Failed to fetch"); })).mode, "local");
});

/* ------------------------------------------------------------ store local */
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { get: async (k) => (m.has(k) ? { value: m.get(k) } : null), set: async (k, v) => { m.set(k, v); }, m };
}

test("local: lecture des quatre clés historiques, valeurs absentes ou corrompues tolérées", async () => {
  const st = fakeStorage({
    "etabli:settings": JSON.stringify({ company: { nom: "X" }, params: {} }),
    "etabli:quotes": JSON.stringify([q("a")]),
    "etabli:catalogue": "{corrompu",
  });
  const d = await S.createLocalStore(st).loadAll();
  assert.equal(d.settings.company.nom, "X");
  assert.deepEqual(d.quotes, [q("a")]);
  assert.equal(d.calepinage, null);
  assert.deepEqual(d.catalogue, [], "JSON corrompu → liste vide, sans exception");
  assert.deepEqual(await S.createLocalStore(fakeStorage()).loadAll(), { settings: null, quotes: [], calepinage: null, catalogue: [] });
});

test("local: écritures aux mêmes clés qu'avant (compatibilité des données existantes)", async () => {
  const st = fakeStorage();
  const l = S.createLocalStore(st);
  assert.deepEqual(await l.saveSettings({ company: {}, params: {} }), { ok: true });
  await l.saveCalepinage({ materials: [] });
  await l.saveCatalog([{ id: "c" }]);
  await l.syncQuotes([], [q("a"), q("b")]);
  assert.deepEqual([...st.m.keys()].sort(), ["etabli:calepinage", "etabli:catalogue", "etabli:quotes", "etabli:settings"]);
  assert.deepEqual(JSON.parse(st.m.get("etabli:quotes")), [q("a"), q("b")], "la liste complète est réécrite");
  const bad = await S.createLocalStore({ get: async () => null, set: async () => { throw new Error("quota"); } }).saveCatalog([]);
  assert.equal(bad.ok, false);
  assert.match(bad.message, /quota/);
});

/* ------------------------------------------------------------ store serveur */
// mini serveur en mémoire respectant le contrat de /api
function memServer() {
  const quotes = new Map(); let n = 0;
  const log = [];
  const handler = (method, url, body) => {
    log.push(method + " " + url);
    if (url === "/api/data") return { status: 200, json: { settings: { company: {} }, calepinage: null, catalogue: [], migrated: false, quotes: [...quotes.values()].map((x) => ({ ...x.quote, _rev: x.rev })) } };
    const m = /^\/api\/quotes\/(.+)$/.exec(url);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === "DELETE") { quotes.delete(id); return { status: 200, json: { ok: true } }; }
      const cur = quotes.get(id);
      if (cur && cur.rev !== body.baseRev) return { status: 409, json: { error: "conflict", currentRev: cur.rev } };
      const rev = (cur ? cur.rev : 0) + 1; n++;
      quotes.set(id, { rev, quote: body.quote });
      return { status: 200, json: { rev } };
    }
    return { status: 404, json: { error: "?" } };
  };
  return { handler, quotes, log, seed: (id, rev) => quotes.set(id, { rev, quote: q(id) }) };
}

test("serveur: loadAll retire _rev des devis (état propre) et mémorise les révisions", async () => {
  const srv = memServer(); srv.seed("a", 3);
  const st = S.createServerStore(fakeFetch(srv.handler));
  const d = await st.loadAll();
  assert.deepEqual(d.quotes, [q("a")], "pas de _rev dans les devis rendus à l'application");
  assert.equal(d.migrated, false);
  // la révision mémorisée est utilisée à l'écriture suivante
  const f = fakeFetch(srv.handler); const st2 = S.createServerStore(f);
  await st2.loadAll();
  const r = await st2.syncQuotes(d.quotes, [{ ...d.quotes[0], chantier: "x" }]);
  assert.equal(r.ok, true);
  assert.equal(f.calls.at(-1).body.baseRev, 3);
  assert.equal(srv.quotes.get("a").rev, 4);
});

test("serveur: syncQuotes n'envoie que la DIFFÉRENCE (ajout, modification, suppression ; rien si identique)", async () => {
  const srv = memServer(); srv.seed("a", 1); srv.seed("b", 1); srv.seed("c", 1);
  const f = fakeFetch(srv.handler); const st = S.createServerStore(f);
  const prev = (await st.loadAll()).quotes;
  f.calls.length = 0;
  assert.deepEqual(await st.syncQuotes(prev, prev.slice()), { ok: true });
  assert.equal(f.calls.length, 0, "identique → aucun appel réseau");
  const next = [q("new"), { ...prev[0], chantier: "modifié" }, prev[1] /* c supprimé */];
  const r = await st.syncQuotes(prev, next);
  assert.equal(r.ok, true);
  const sent = f.calls.map((c) => c.method + " " + c.url).sort();
  assert.deepEqual(sent, ["DELETE /api/quotes/c", "PUT /api/quotes/a", "PUT /api/quotes/new"]);
  assert.equal(f.calls.find((c) => c.url.endsWith("/new")).body.baseRev, null, "nouveau devis : « je crée »");
  assert.ok(!f.calls.some((c) => c.url.endsWith("/b")), "devis inchangé non réécrit");
});

test("serveur: la révision suivante est reprise après chaque écriture (enregistrements successifs sans conflit)", async () => {
  const srv = memServer();
  const st = S.createServerStore(fakeFetch(srv.handler));
  await st.loadAll();
  let list = [];
  for (let i = 1; i <= 3; i++) {
    const next = [q("a", { chantier: "v" + i })];
    assert.equal((await st.syncQuotes(list, next)).ok, true, "enregistrement " + i);
    list = next;
  }
  assert.equal(srv.quotes.get("a").rev, 3);
});

test("serveur: conflit (409) → échec « conflict » avec les ids, les autres devis sont tout de même envoyés", async () => {
  const srv = memServer(); srv.seed("a", 1); srv.seed("b", 1);
  const f = fakeFetch(srv.handler); const st = S.createServerStore(f);
  const prev = (await st.loadAll()).quotes;
  srv.quotes.get("a").rev = 5; // modifié depuis un autre appareil
  const r = await st.syncQuotes(prev, [{ ...prev[0], chantier: "moi" }, { ...prev[1], chantier: "moi aussi" }]);
  assert.equal(r.ok, false);
  assert.equal(r.kind, "conflict");
  assert.deepEqual(r.conflicts, ["a"]);
  assert.equal(srv.quotes.get("b").quote.chantier, "moi aussi");
  assert.equal(srv.quotes.get("a").quote.chantier, undefined, "la version du serveur n'est pas écrasée");
});

test("serveur: ids encodés dans l'URL (caractères spéciaux)", async () => {
  const srv = memServer();
  const f = fakeFetch(srv.handler); const st = S.createServerStore(f);
  await st.loadAll();
  await st.syncQuotes([], [q("a b/c")]);
  assert.equal(f.calls.at(-1).url, "/api/quotes/a%20b%2Fc");
});

test("serveur: 401 → onUnauthorized appelé + échec « auth » ; réseau coupé → « network » sans exception", async () => {
  let called = 0;
  const st = S.createServerStore(fakeFetch(() => ({ status: 401, json: { error: "Non connecté" } })), () => called++);
  const r = await st.saveCatalog([]);
  assert.deepEqual([r.ok, r.kind, called], [false, "auth", 1]);
  const r2 = await st.syncQuotes([], [q("a")]);
  assert.equal(r2.kind, "auth");
  const off = S.createServerStore(async () => { throw new TypeError("Failed to fetch"); });
  assert.equal((await off.saveSettings({})).kind, "network");
  assert.equal((await off.syncQuotes([], [q("a")])).kind, "network");
  await assert.rejects(() => off.loadAll(), (e) => e.kind === "network");
});

test("serveur: erreur 500 → « server » avec le message du serveur ; la suite des écritures s'arrête", async () => {
  const f = fakeFetch((m, u) => (u.endsWith("/a") ? { status: 500, json: { error: "disque plein" } } : { status: 200, json: { rev: 1 } }));
  const st = S.createServerStore(f);
  const r = await st.syncQuotes([], [q("a"), q("b")]);
  assert.deepEqual([r.ok, r.kind, r.message], [false, "server", "disque plein"]);
  assert.equal(f.calls.length, 1, "pas d'acharnement : on s'arrête à la première erreur serveur");
});

test("serveur: login — succès, mauvais identifiants, verrouillage (Retry-After), réseau", async () => {
  const mk = (r) => S.createServerStore(fakeFetch(() => r));
  assert.deepEqual(await mk({ status: 200, json: { login: "paul" } }).login("paul", "x"), { ok: true, login: "paul" });
  const bad = await mk({ status: 401, json: { error: "Identifiant ou mot de passe incorrect" } }).login("p", "x");
  assert.deepEqual([bad.ok, bad.kind, bad.message], [false, "auth", "Identifiant ou mot de passe incorrect"]);
  const lock = await mk({ status: 429, json: { error: "Trop de tentatives." }, headers: { "retry-after": "840" } }).login("p", "x");
  assert.deepEqual([lock.kind, lock.retryAfter], ["locked", 840]);
  assert.equal((await S.createServerStore(async () => { throw new TypeError("x"); }).login("p", "x")).kind, "network");
});

test("serveur: importBackup et skipMigration", async () => {
  const f = fakeFetch((m, u, b) => (u === "/api/import" ? { status: 200, json: { quotes: { added: 2 } } } : { status: 200, json: { ok: true } }));
  const st = S.createServerStore(f);
  const r = await st.importBackup({ app: "etabli" });
  assert.deepEqual([r.ok, r.summary.quotes.added], [true, 2]);
  assert.deepEqual(f.calls[0].body, { backup: { app: "etabli" } });
  assert.deepEqual(await st.skipMigration(), { ok: true });
  const err = await S.createServerStore(fakeFetch(() => ({ status: 400, json: { error: "Ce fichier n'est pas une sauvegarde Établi." } }))).importBackup({});
  assert.deepEqual([err.ok, err.kind], [false, "server"]);
});

test("serveur: changePassword — succès, refus (400 → « invalid », sans déconnexion), verrouillage", async () => {
  let unauth = 0;
  const mk = (r) => S.createServerStore(fakeFetch(() => r), () => unauth++);
  assert.deepEqual(await mk({ status: 200, json: { ok: true } }).changePassword("a", "b"), { ok: true });
  const bad = await mk({ status: 400, json: { error: "Mot de passe actuel incorrect." } }).changePassword("a", "b");
  assert.deepEqual([bad.ok, bad.kind, bad.message, unauth], [false, "invalid", "Mot de passe actuel incorrect.", 0]);
  const lock = await mk({ status: 429, json: { error: "Trop de tentatives." }, headers: { "retry-after": "600" } }).changePassword("a", "b");
  assert.deepEqual([lock.kind, lock.retryAfter], ["locked", 600]);
});
