"use strict";
/* cloudflare-ips.sh : génération (hors ligne, listes locales), refus des listes invalides sans toucher à l'ancien
   fichier, idempotence ; et, si Caddy est installé, vérification de la syntaxe ET du comportement réel
   (hors plage → 403, dans la plage → proxifié). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "..", "cloudflare-ips.sh");
const HAVE_CADDY = spawnSync("caddy", ["version"]).status === 0;
const V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18"];
const V6 = ["2400:cb00::/32", "2606:4700::/32"];

function env(extra) { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; }
function world(v4 = V4, v6 = V6) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "etabli-cf-"));
  fs.writeFileSync(path.join(d, "v4"), v4.join("\n") + "\n");
  fs.writeFileSync(path.join(d, "v6"), v6.join("\n") + "\n");
  const out = path.join(d, "etabli-cloudflare.caddy");
  const run = () => spawnSync("bash", [SCRIPT], { encoding: "utf8", env: env({ OUT: out, CF_IPS_V4_FILE: path.join(d, "v4"), CF_IPS_V6_FILE: path.join(d, "v6") }) });
  return { d, out, run };
}

test("génère « @notcf not remote_ip … » + « handle @notcf » avec toutes les plages", () => {
  const w = world();
  const r = w.run();
  assert.equal(r.status, 0, r.stderr);
  const txt = fs.readFileSync(w.out, "utf8");
  assert.match(txt, /^@notcf not remote_ip /m);
  for (const c of [...V4, ...V6]) assert.ok(txt.includes(c), c);
  assert.match(txt, /handle @notcf \{\n\trespond "Accès direct refusé" 403\n\}/);
  assert.equal((fs.statSync(w.out).mode & 0o777).toString(8), "644");
});

test("idempotent : relancé sans changement, le fichier n'est pas réécrit", () => {
  const w = world();
  w.run();
  const m1 = fs.statSync(w.out).mtimeMs;
  const r = w.run();
  assert.match(r.stdout, /déjà à jour/);
  assert.equal(fs.statSync(w.out).mtimeMs, m1);
});

test("liste invalide (plage mal formée, vide, trop courte, HTML d'une page d'erreur) → refusée, l'ancien fichier reste", () => {
  const w = world();
  w.run();
  const good = fs.readFileSync(w.out, "utf8");
  const bads = [
    [[...V4, "pas-une-plage"], V6],
    [[...V4, "1.2.3.4"], V6],                       // sans masque
    [[], V6],
    [V4.slice(0, 2), V6],                           // trop courte
    [V4, []],
    [["<html>", "502 Bad Gateway"], ["</html>"]],
    [V4, ["2400:cb00::/32", "zz/32"]],
  ];
  for (const [v4, v6] of bads) {
    fs.writeFileSync(path.join(w.d, "v4"), v4.join("\n"));
    fs.writeFileSync(path.join(w.d, "v6"), v6.join("\n"));
    const r = w.run();
    assert.notEqual(r.status, 0, JSON.stringify([v4, v6]));
    assert.equal(fs.readFileSync(w.out, "utf8"), good, "l'ancien fichier est intact");
  }
});

test("Caddy: le Caddyfile d'exemple (Option B) est syntaxiquement valide avec le fichier généré", { skip: !HAVE_CADDY && "caddy non installé" }, () => {
  const w = world();
  w.run();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etabli-cf-cfg-"));
  const cf = path.join(dir, "Caddyfile");
  // on extrait le bloc « etabli.example.com { … } » de l'exemple, avec le chemin du fichier généré en test
  const ex = fs.readFileSync(path.join(__dirname, "..", "Caddyfile.example"), "utf8");
  const block = /^etabli\.example\.com \{[\s\S]*?^\}/m.exec(ex)[0].replace("/etc/caddy/etabli-cloudflare.caddy", w.out);
  fs.writeFileSync(cf, "{\n\tauto_https off\n}\n" + block.replace("etabli.example.com", "http://etabli.example.com") + "\n");
  const r = spawnSync("caddy", ["validate", "--config", cf, "--adapter", "caddyfile"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  // l'option A (sslip) aussi
  const a = /^203-0-113-10\.sslip\.io \{[\s\S]*?^\}/m.exec(ex)[0];
  const cfA = path.join(dir, "CaddyfileA");
  fs.writeFileSync(cfA, a + "\n");
  assert.equal(spawnSync("caddy", ["validate", "--config", cfA, "--adapter", "caddyfile"], { encoding: "utf8" }).status, 0);
});

test("Caddy, comportement réel : hors plage Cloudflare → 403 sans atteindre ÉTABLI ; dans la plage → proxifié", { skip: !HAVE_CADDY && "caddy non installé" }, async () => {
  let reached = 0;
  const backend = http.createServer((req, res) => { reached++; res.end("backend:" + (req.headers["cf-connecting-ip"] || "-")); });
  await new Promise((r) => backend.listen(0, "127.0.0.1", r));
  const free = () => new Promise((r) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  const port = await free();

  async function withCaddy(ranges, fn) {
    const w = world(ranges, V6);
    assert.equal(w.run().status, 0);
    const cf = path.join(w.d, "Caddyfile");
    fs.writeFileSync(cf, `{\n\tauto_https off\n\tadmin off\n}\nhttp://127.0.0.1:${port} {\n\timport ${w.out}\n\thandle {\n\t\treverse_proxy 127.0.0.1:${backend.address().port}\n\t}\n}\n`);
    const proc = spawn("caddy", ["run", "--config", cf, "--adapter", "caddyfile"], { stdio: "ignore" });
    try {
      for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
      await fn();
    } finally { proc.kill(); await new Promise((r) => proc.on("close", r)); }
  }
  // 1) 127.0.0.1 n'est PAS une plage Cloudflare : accès direct refusé, même avec un en-tête CF-Connecting-IP forgé
  await withCaddy(V4, async () => {
    const before = reached;
    const r = await fetch(`http://127.0.0.1:${port}/`, { headers: { "CF-Connecting-IP": "203.0.113.77" } });
    assert.equal(r.status, 403);
    assert.match(await r.text(), /Accès direct refusé/);
    assert.equal(reached, before, "la requête n'a pas atteint ÉTABLI");
  });
  // 2) avec 127.0.0.0/8 dans la liste (simule une requête venant de Cloudflare) : transmise
  await withCaddy([...V4, "127.0.0.0/8"], async () => {
    const r = await fetch(`http://127.0.0.1:${port}/`, { headers: { "CF-Connecting-IP": "203.0.113.77" } });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "backend:203.0.113.77");
  });
  backend.close();
});
