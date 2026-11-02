"use strict";
/* Teste update.sh et backup.sh de bout en bout, avec un « faux GitHub » local (dépôt git sur disque,
   mêmes commandes que la production : clone partiel + sparse checkout + tirage). Aucun accès réseau. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const UPDATE = path.join(__dirname, "..", "update.sh");
const BACKUP = path.join(__dirname, "..", "backup.sh");

// Environnement propre pour les scripts testés : la variable NODE_TEST_CONTEXT du lanceur de tests
// fuiterait vers le « node --test » imbriqué et masquerait ses échecs (artefact de test, pas de production).
const cleanEnv = (extra) => { const e = { ...process.env, ...(extra || {}) }; delete e.NODE_TEST_CONTEXT; return e; };

function sh(cmd, args, opts) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return r;
}
function git(cwd, ...args) {
  const r = sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + " : " + r.stderr);
  return r.stdout.trim();
}

function makeWorld() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "etabli-upd-"));
  const remote = path.join(root, "remote");
  const base = path.join(root, "base");
  fs.mkdirSync(remote);
  git(remote, "init", "-q", "-b", "main");
  git(remote, "config", "uploadpack.allowFilter", "true");
  git(remote, "config", "uploadpack.allowAnySHA1InWant", "true");
  const write = (rel, content) => { const f = path.join(remote, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
  // un test qui passe ou échoue selon le contenu du fichier MODE de la version testée
  const testFile = 'const t=require("node:test"),a=require("node:assert");t("v",()=>{a.equal(require("fs").readFileSync(__dirname+"/../MODE","utf8").trim(),"ok");});\n';
  const commit = (label, { mode = "ok", extra = {} } = {}) => {
    write("server/MODE", mode + "\n");
    write("server/test/x.test.js", testFile);
    write("site/devjs/index.html", "<html>" + label + "</html>");
    write("deploy/update.sh", "# " + label + "\n");
    write("navvis_export/gros.bin", "x".repeat(5000) + label); // hors des chemins déployés
    for (const [k, v] of Object.entries(extra)) { if (v === null) fs.rmSync(path.join(remote, k), { recursive: true, force: true }); else write(k, v); }
    git(remote, "add", "-A");
    git(remote, "commit", "-q", "-m", label);
    return git(remote, "rev-parse", "HEAD");
  };
  const restartLog = path.join(root, "restarts.log");
  const countLog = path.join(root, "tests-run.log");
  const env = (extra) => cleanEnv({
    REPO_URL: "file://" + remote, BRANCH: "main", BASE_DIR: base,
    RESTART_CMD: `echo restart >> '${restartLog}'`, HEALTH_URL: "", HEALTH_TRIES: "2", KEEP: "3",
    TEST_CMD: `echo run >> '${countLog}'; node --test server/test/x.test.js`, ...(extra || {}),
  });
  const run = (extra) => sh("bash", [UPDATE], { env: env(extra), encoding: "utf8" });
  const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length : 0);
  const current = () => (fs.existsSync(path.join(base, "current")) ? path.basename(fs.realpathSync(path.join(base, "current"))) : null);
  return { root, remote, base, commit, run, restarts: () => lines(restartLog), testRuns: () => lines(countLog), current, releases: () => fs.readdirSync(path.join(base, "releases")).filter((n) => !n.startsWith(".")).sort() };
}

test("premier déploiement: clone partiel, seuls server/ site/devjs/ deploy/ sont récupérés, tests lancés, service redémarré", () => {
  const w = makeWorld();
  const sha = w.commit("v1");
  const r = w.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(w.current(), sha);
  assert.match(r.stdout, /en service/);
  assert.equal(w.restarts(), 1);
  assert.equal(w.testRuns(), 1);
  const rel = path.join(w.base, "releases", sha);
  assert.deepEqual(fs.readdirSync(rel).sort(), ["deploy", "server", "site"], "rien d'autre que les dossiers utiles");
  assert.ok(!fs.existsSync(path.join(rel, "navvis_export")));
  assert.ok(!fs.existsSync(path.join(w.base, "repo", "navvis_export")), "le dépôt local est « sparse » : le gros dossier n'est pas téléchargé");
  assert.match(fs.readFileSync(path.join(rel, "site/devjs/index.html"), "utf8"), /v1/);
});

test("aucun changement: silencieux, rien n'est retesté ni redémarré (le minuteur tourne toutes les 5 min)", () => {
  const w = makeWorld();
  w.commit("v1"); w.run();
  const r = w.run();
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "", "aucune sortie quand il n'y a rien à faire");
  assert.equal(w.restarts(), 1);
  assert.equal(w.testRuns(), 1);
});

test("nouvelle version: déployée, bascule du lien « current », ancienne version conservée pour le retour arrière", () => {
  const w = makeWorld();
  const s1 = w.commit("v1"); w.run();
  const s2 = w.commit("v2");
  const r = w.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(w.current(), s2);
  assert.deepEqual(w.releases(), [s1, s2].sort());
  assert.equal(w.restarts(), 2);
  assert.match(fs.readFileSync(path.join(w.base, "current", "site/devjs/index.html"), "utf8"), /v2/);
});

test("tests en échec: la version est IGNORÉE, l'actuelle reste en service, pas de redémarrage, pas de nouvel essai en boucle", () => {
  const w = makeWorld();
  const s1 = w.commit("v1"); w.run();
  const bad = w.commit("v2-cassée", { mode: "ko" });
  const r = w.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /tests EN ÉCHEC/);
  assert.equal(w.current(), s1, "la version en service n'a pas bougé");
  assert.equal(w.restarts(), 1, "pas de redémarrage");
  assert.ok(fs.existsSync(path.join(w.base, "bad", bad)), "commit marqué mauvais");
  assert.match(fs.readFileSync(path.join(w.base, "bad", bad + ".log"), "utf8"), /not ok|fail/i, "le détail de l'échec est conservé");
  assert.ok(!fs.existsSync(path.join(w.base, "releases", bad)));
  const runsAfter = w.testRuns();
  const again = w.run();
  assert.equal(again.status, 0);
  assert.equal(again.stdout.trim(), "", "silencieux");
  assert.equal(w.testRuns(), runsAfter, "le commit mauvais n'est pas retesté toutes les 5 minutes");
  // un commit correctif repart normalement
  const fixed = w.commit("v3-corrigée");
  assert.equal(w.run().status, 0);
  assert.equal(w.current(), fixed);
});

test("service qui ne répond pas après la bascule → RETOUR ARRIÈRE automatique et version marquée mauvaise", async () => {
  const w = makeWorld();
  let healthy = true;
  const srv = http.createServer((req, res) => { res.statusCode = healthy ? 200 : 500; res.end("x"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + srv.address().port + "/api/health";
  try {
    const s1 = w.commit("v1");
    // spawn asynchrone : le serveur de santé tourne dans CE processus, un spawnSync le bloquerait
    const runAsync = (extra) => new Promise((resolve) => {
      const p = spawn("bash", [UPDATE], { env: cleanEnv({ REPO_URL: "file://" + w.remote, BRANCH: "main", BASE_DIR: w.base, RESTART_CMD: `echo restart >> '${path.join(w.root, "restarts.log")}'`, HEALTH_URL: url, HEALTH_TRIES: "2", KEEP: "3", TEST_CMD: "node --test server/test/x.test.js", ...(extra || {}) }) });
      let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ status: code, stdout: out }));
    });
    assert.equal((await runAsync()).status, 0);
    assert.equal(w.current(), s1);
    const s2 = w.commit("v2");
    healthy = false;
    const r = await runAsync();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /RETOUR ARRIÈRE/);
    assert.equal(w.current(), s1, "l'ancienne version est rétablie");
    assert.equal(w.restarts(), 3, "démarrage initial + essai + redémarrage du retour arrière");
    assert.ok(fs.existsSync(path.join(w.base, "bad", s2)));
    healthy = true;
    assert.equal((await runAsync()).stdout.trim(), "", "version mauvaise : pas de nouvel essai");
  } finally { srv.close(); }
});

test("nettoyage: seules les KEEP versions récentes sont gardées (la courante et la précédente jamais supprimées)", () => {
  const w = makeWorld();
  const shas = [];
  for (let i = 1; i <= 5; i++) {
    shas.push(w.commit("v" + i));
    assert.equal(w.run({ KEEP: "2" }).status, 0);
    // horodatages distincts (le tri se fait par date de modification)
    const d = path.join(w.base, "releases", shas[i - 1]);
    const t = new Date(Date.now() - (5 - i) * 60000);
    fs.utimesSync(d, t, t);
  }
  const left = w.releases();
  assert.ok(left.length <= 3, left.join(","));
  assert.ok(left.includes(shas[4]) && left.includes(shas[3]), "la courante et la précédente sont là");
});

test("version dont un dossier requis manque (ex. server/ supprimé) → ignorée, jamais déployée", () => {
  const w = makeWorld();
  const s1 = w.commit("v1"); w.run();
  const bad = w.commit("v2-sans-serveur", { extra: { server: null } });
  const r = w.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /absent de cette version/);
  assert.equal(w.current(), s1);
  assert.ok(fs.existsSync(path.join(w.base, "bad", bad)));
});

test("verrou: une 2ᵉ exécution simultanée ne fait rien", () => {
  const w = makeWorld();
  w.commit("v1");
  fs.mkdirSync(w.base, { recursive: true });
  // un autre processus tient le verrou
  const holder = spawn("bash", ["-c", `exec 9>'${path.join(w.base, ".update.lock")}'; flock 9; sleep 3`]);
  const t0 = Date.now();
  while (Date.now() - t0 < 1500 && !fs.existsSync(path.join(w.base, ".update.lock"))) { /* attend le fichier de verrou */ }
  sh("sleep", ["0.5"]);
  const r = w.run();
  holder.kill();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /déjà en cours/);
  assert.equal(w.current(), null, "rien n'a été déployé pendant que le verrou était tenu");
});

test("backup.sh: archive des données en 600 / dossier 700, rotation, contenu complet", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "etabli-bak-"));
  const data = path.join(root, "var-lib", "etabli");
  fs.mkdirSync(path.join(data, "accounts", "paul", "quotes"), { recursive: true });
  fs.writeFileSync(path.join(data, "users.json"), "{}");
  fs.writeFileSync(path.join(data, "accounts", "paul", "quotes", "q1.json"), '{"rev":1}');
  const out = path.join(root, "backups");
  for (let i = 0; i < 4; i++) {
    const r = sh("bash", [BACKUP], { env: { ...process.env, DATA_DIR: data, BACKUP_DIR: out, KEEP: "2" } });
    assert.equal(r.status, 0, r.stderr);
    sh("sleep", ["1.1"]); // noms horodatés à la seconde
  }
  const files = fs.readdirSync(out).sort();
  assert.equal(files.length, 2, "rotation : seules les 2 dernières restent");
  assert.equal((fs.statSync(out).mode & 0o777).toString(8), "700");
  assert.equal((fs.statSync(path.join(out, files[0])).mode & 0o777).toString(8), "600");
  const list = sh("tar", ["-tzf", path.join(out, files[1])]).stdout;
  assert.match(list, /etabli\/users\.json/);
  assert.match(list, /etabli\/accounts\/paul\/quotes\/q1\.json/);
});

test("contrôle de santé: utilise HOST/PORT de l'environnement (ÉTABLI derrière Coolify n'écoute pas sur 127.0.0.1)", async () => {
  const w = makeWorld();
  let healthy = true, hits = 0;
  const srv = http.createServer((req, res) => { hits++; res.statusCode = healthy ? 200 : 500; res.end("x"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = String(srv.address().port);
  try {
    w.commit("v1");
    const runAsync = () => new Promise((resolve) => {
      const e = cleanEnv({ REPO_URL: "file://" + w.remote, BRANCH: "main", BASE_DIR: w.base, RESTART_CMD: `echo restart >> '${path.join(w.root, "restarts.log")}'`, HEALTH_TRIES: "2", TEST_CMD: "node --test server/test/x.test.js", HOST: "127.0.0.1", PORT: port });
      delete e.HEALTH_URL; // → URL déduite de HOST/PORT
      const p = spawn("bash", [UPDATE], { env: e });
      let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ status: code, stdout: out }));
    });
    const r1 = await runAsync();
    assert.equal(r1.status, 0, r1.stdout);
    assert.ok(hits >= 1, "le contrôle a bien interrogé HOST:PORT");
    const s1 = w.current();
    w.commit("v2");
    healthy = false;
    const r2 = await runAsync();
    assert.equal(r2.status, 1);
    assert.match(r2.stdout, /RETOUR ARRIÈRE/, "service qui ne répond pas à HOST:PORT → retour arrière");
    assert.equal(w.current(), s1);
  } finally { srv.close(); }
});

test("contrôle de santé: HOST=0.0.0.0 est interrogé via 127.0.0.1", async () => {
  const w = makeWorld();
  let hits = 0;
  const srv = http.createServer((req, res) => { hits++; res.end("ok"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    w.commit("v1");
    const e = cleanEnv({ REPO_URL: "file://" + w.remote, BRANCH: "main", BASE_DIR: w.base, RESTART_CMD: "true", HEALTH_TRIES: "2", TEST_CMD: "node --test server/test/x.test.js", HOST: "0.0.0.0", PORT: String(srv.address().port) });
    delete e.HEALTH_URL;
    const code = await new Promise((resolve) => spawn("bash", [UPDATE], { env: e }).on("close", resolve));
    assert.equal(code, 0);
    assert.ok(hits >= 1);
  } finally { srv.close(); }
});
