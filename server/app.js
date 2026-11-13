"use strict";
/* Gestionnaire HTTP d'ÉTABLI : fichiers statiques de l'application + API JSON authentifiée.
   Aucune dépendance. Voir README.md (dossier deploy/) pour l'exploitation. */
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { Store, ID_RE } = require("./lib/store.js");
const Auth = require("./lib/auth.js");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png" };
// Seuls ces fichiers de l'application sont servis (ni tests, ni README, ni package.json).
const STATIC_OK = [/^\/index\.html$/, /^\/migrate\.html$/, /^\/migrate-config\.js$/, /^\/lib\/[A-Za-z0-9_.-]+\.js$/,
  /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\/[A-Za-z0-9_-]+\.png$/]; // + application installable (PWA)
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// L'application charge React/Babel depuis unpkg et des polices Google ; Babel compile dans le
// navigateur (d'où 'unsafe-eval'). Tout le reste est limité à l'origine elle-même.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  // le service worker (sw.js) va chercher lui-même les bibliothèques et polices pour les garder hors ligne :
  // son CSP doit autoriser ces hôtes en connexion
  "connect-src 'self' https://unpkg.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

function createApp(userCfg) {
  const cfg = {
    dataDir: "./data", staticDir: "../site/devjs", cookieSecure: true, trustProxy: "0",
    legacyUrl: "", sessionDays: 30, maxBody: 8 * 1024 * 1024, log: true, ...userCfg,
  };
  const store = new Store(cfg.dataDir);
  const users = new Auth.Users(cfg.dataDir);
  const limitLogin = new Auth.Limiter({ max: 5, windowMs: 15 * 60e3, lockMs: 15 * 60e3 });
  const limitIp = new Auth.Limiter({ max: 30, windowMs: 15 * 60e3, lockMs: 15 * 60e3 });
  const ttlMs = cfg.sessionDays * 86400e3;
  let secret = null;
  const ready = (async () => { await store.init(); secret = await Auth.loadSecret(cfg.dataDir); })();

  function send(res, status, obj, headers) {
    const body = obj == null ? "" : JSON.stringify(obj);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...(headers || {}) });
    res.end(body);
  }

  // IP du client (limitation des tentatives). Derrière un proxy, l'en-tête n'est digne de confiance QUE si le
  // serveur ne reçoit que du trafic de ce proxy (voir deploy/README.md et cloudflare-ips.sh). Une valeur qui
  // n'est pas une adresse IP valide est ignorée : on retombe sur l'adresse de la connexion.
  function clientIp(req) {
    const sock = req.socket.remoteAddress || "?";
    let h = "";
    if (cfg.trustProxy === "cf") h = req.headers["cf-connecting-ip"];
    else if (cfg.trustProxy === "xff") h = String(req.headers["x-forwarded-for"] || "").split(",")[0];
    h = h ? String(h).trim() : "";
    return h && net.isIP(h) ? h : sock;
  }

  // Secret partagé avec le proxy (Cloudflare : règle « Modify Request Header » qui ajoute X-Etabli-Edge).
  // S'il est configuré, toute requête qui ne le porte pas reçoit un 403 — sauf /api/health (contrôle de santé
  // local, sans donnée). Un visiteur qui contourne le proxy en visitant l'IP du serveur ne peut ni forger
  // CF-Connecting-IP ni même atteindre l'application. Indépendant des plages d'IP de Cloudflare et de la façon
  // dont le proxy est installé (Caddy, Docker, Coolify…).
  const edgeSecret = cfg.edgeSecret ? Buffer.from(String(cfg.edgeSecret)) : null;
  function edgeOk(req) {
    if (!edgeSecret) return true;
    const h = req.headers["x-etabli-edge"];
    if (typeof h !== "string") return false;
    const got = Buffer.from(h);
    return got.length === edgeSecret.length && crypto.timingSafeEqual(got, edgeSecret);
  }

  // Protection CSRF : requête du même site uniquement (en plus de SameSite=Lax et du Content-Type JSON).
  function sameOrigin(req) {
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") return false;
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return false; } catch (_) { return false; } }
    return true;
  }

  function readBody(req, res) {
    return new Promise((resolve, reject) => {
      const tooBig = () => {
        // on répond 413 PUIS on coupe la connexion (le corps restant n'est pas lu)
        res.setHeader("Connection", "close");
        res.on("finish", () => req.destroy());
        reject({ status: 413, message: "Requête trop volumineuse" });
      };
      if (Number(req.headers["content-length"]) > cfg.maxBody) return tooBig();
      const chunks = []; let size = 0, over = false;
      req.on("data", (c) => {
        if (over) return;
        size += c.length;
        if (size > cfg.maxBody) { over = true; chunks.length = 0; tooBig(); return; }
        chunks.push(c);
      });
      req.on("end", () => { if (!over) resolve(Buffer.concat(chunks).toString("utf8")); });
      req.on("error", reject);
    });
  }
  async function readJSONBody(req, res) {
    if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) throw { status: 415, message: "Content-Type application/json requis" };
    const text = await readBody(req, res);
    try { return text ? JSON.parse(text) : {}; } catch (_) { throw { status: 400, message: "JSON invalide" }; }
  }

  async function session(req) {
    const s = Auth.readSession(secret, Auth.parseCookies(req.headers.cookie)[Auth.COOKIE]);
    if (!s) return null;
    const rec = (await users.load()).users[s.login];
    return rec && (rec.epoch || 1) === s.epoch ? s : null;
  }

  async function login(req, res) {
    const body = await readJSONBody(req, res);
    const name = String(body.login || "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const ip = clientIp(req), k1 = ip + "|" + name;
    const lock = limitLogin.check(k1).locked ? limitLogin.check(k1) : limitIp.check(ip);
    if (lock.locked) return send(res, 429, { error: "Trop de tentatives. Réessayez plus tard." }, { "Retry-After": String(lock.retryAfterSec) });
    const u = password.length <= 256 ? await users.check(name, password) : null;
    if (!u) {
      limitLogin.fail(k1); limitIp.fail(ip);
      return send(res, 401, { error: "Identifiant ou mot de passe incorrect" });
    }
    limitLogin.success(k1);
    const token = Auth.signSession(secret, u, ttlMs);
    send(res, 200, { login: u.login }, { "Set-Cookie": Auth.cookieHeader(token, { secure: cfg.cookieSecure, maxAgeSec: Math.floor(ttlMs / 1000) }) });
  }

  async function api(req, res, url) {
    const p = url.pathname, m = req.method;
    res.setHeader("Cache-Control", "no-store");
    if (p === "/api/health" && (m === "GET" || m === "HEAD")) return send(res, 200, { ok: true });
    if (m !== "GET" && m !== "HEAD" && !sameOrigin(req)) return send(res, 403, { error: "Origine refusée" });
    if (p === "/api/login" && m === "POST") return login(req, res);
    if (p === "/api/logout" && m === "POST") {
      return send(res, 200, { ok: true }, { "Set-Cookie": Auth.cookieHeader("", { secure: cfg.cookieSecure, maxAgeSec: 0 }) });
    }
    const s = await session(req);
    if (!s) return send(res, 401, { error: "Non connecté" });
    const who = s.login;

    if (p === "/api/me" && m === "GET") {
      return send(res, 200, { login: who, legacyUrl: cfg.legacyUrl || "", migrated: !!(await store.getMeta(who)).migrated });
    }
    if (p === "/api/data" && m === "GET") return send(res, 200, await store.allData(who));

    let mm = /^\/api\/(settings|calepinage|catalogue|clients)$/.exec(p);
    if (mm && m === "PUT") {
      const body = await readJSONBody(req, res);
      try { await store.setDoc(who, mm[1], body.value); } catch (e) { throw { status: 400, message: e.message }; }
      return send(res, 200, { ok: true });
    }

    mm = /^\/api\/quotes\/([^/]+)$/.exec(p);
    if (mm) {
      let id; try { id = decodeURIComponent(mm[1]); } catch (_) { id = ""; }
      if (!ID_RE.test(id)) return send(res, 400, { error: "Identifiant de devis invalide" });
      if (m === "PUT") {
        const body = await readJSONBody(req, res);
        const q = body.quote;
        if (!isObj(q) || !Array.isArray(q.lines) || q.id !== id) return send(res, 400, { error: "Devis invalide (objet avec id et lignes attendu)" });
        const baseRev = body.baseRev == null ? null : body.baseRev;
        if (baseRev !== null && !Number.isInteger(baseRev)) return send(res, 400, { error: "baseRev invalide" });
        const r = await store.putQuote(who, id, q, baseRev);
        return r.conflict ? send(res, 409, { error: "conflict", currentRev: r.currentRev }) : send(res, 200, { rev: r.rev });
      }
      if (m === "DELETE") { await store.deleteQuote(who, id); return send(res, 200, { ok: true }); }
    }

    // Changement de mot de passe par l'utilisateur lui-même : l'ancien est exigé (et compte dans la limitation
    // des tentatives, comme une connexion). Toutes les AUTRES sessions sont déconnectées ; celle-ci reçoit un
    // nouveau cookie. Erreurs en 400 (pas 401 : la session reste valide).
    if (p === "/api/password" && m === "POST") {
      const body = await readJSONBody(req, res);
      const current = typeof body.current === "string" ? body.current : "";
      const next = typeof body.next === "string" ? body.next : "";
      const ip = clientIp(req), k1 = ip + "|" + who;
      const lock = limitLogin.check(k1).locked ? limitLogin.check(k1) : limitIp.check(ip);
      if (lock.locked) return send(res, 429, { error: "Trop de tentatives. Réessayez plus tard." }, { "Retry-After": String(lock.retryAfterSec) });
      if (next.length < 10) return send(res, 400, { error: "Nouveau mot de passe trop court (10 caractères minimum)." });
      if (next.length > 256) return send(res, 400, { error: "Nouveau mot de passe trop long (256 caractères maximum)." });
      if (next === current) return send(res, 400, { error: "Le nouveau mot de passe doit être différent de l'actuel." });
      const ok = current.length <= 256 ? await users.check(who, current) : null;
      if (!ok) {
        limitLogin.fail(k1); limitIp.fail(ip);
        return send(res, 400, { error: "Mot de passe actuel incorrect." });
      }
      limitLogin.success(k1);
      await users.setPassword(who, next); // incrémente l'epoch : les autres sessions tombent
      const rec = (await users.load()).users[who];
      const token = Auth.signSession(secret, { login: who, epoch: rec.epoch || 1 }, ttlMs);
      return send(res, 200, { ok: true }, { "Set-Cookie": Auth.cookieHeader(token, { secure: cfg.cookieSecure, maxAgeSec: Math.floor(ttlMs / 1000) }) });
    }

    if (p === "/api/import" && m === "POST") {
      const body = await readJSONBody(req, res);
      try { return send(res, 200, await store.importBackup(who, body.backup)); }
      catch (e) { throw { status: 400, message: e.message }; }
    }
    if (p === "/api/migrated" && m === "POST") {
      await store.setMeta(who, { migrated: true, migratedAt: new Date().toISOString(), skipped: true });
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "Introuvable" });
  }

  function serveStatic(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch (_) { return send(res, 400, { error: "URL invalide" }); }
    if (rel === "/") rel = "/index.html";
    if (rel.includes("\0") || rel.includes("\\") || rel.split("/").includes("..") || !STATIC_OK.some((re) => re.test(rel))) {
      return send(res, 404, { error: "Introuvable" });
    }
    const root = path.resolve(cfg.staticDir);
    const file = path.resolve(root, "." + rel);
    if (!file.startsWith(root + path.sep)) return send(res, 404, { error: "Introuvable" });
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, { error: "Introuvable" });
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-cache" });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  async function handler(req, res) {
    const t0 = Date.now();
    try {
      await ready;
      const url = new URL(req.url, "http://localhost");
      if (cfg.log) res.on("finish", () => console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Content-Security-Policy", CSP);
      if (cfg.cookieSecure) res.setHeader("Strict-Transport-Security", "max-age=15552000");
      if (!edgeOk(req) && url.pathname !== "/api/health") return send(res, 403, { error: "Accès direct refusé" });
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Méthode non autorisée" });
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      if (e && e.status) { if (!res.headersSent) send(res, e.status, { error: e.message }); else res.end(); return; }
      console.error("erreur interne :", e && e.stack || e);
      if (!res.headersSent) send(res, 500, { error: "Erreur interne" }); else res.end();
    }
  }

  return { handler, ready, store, users, cfg };
}

module.exports = { createApp };
