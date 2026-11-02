"use strict";
/* Authentification simple : login + mot de passe.
   - mots de passe hachés avec scrypt (intégré à Node), sel aléatoire, comparaison à temps constant ;
   - session = cookie signé HMAC-SHA256 (sans état serveur : un redéploiement ne déconnecte personne) ;
     chaque compte porte un « epoch » : l'incrémenter (admin revoke) invalide toutes ses sessions ;
   - limitation des tentatives de connexion (par IP+login et par IP). */
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { writeFileAtomic, readJSON, withLock, LOGIN_RE } = require("./store.js");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const COOKIE = "etabli_session";

function scrypt(password, salt, o) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(String(password), salt, o.keylen, { N: o.N, r: o.r, p: o.p }, (e, k) => (e ? reject(e) : resolve(k))));
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return { ...SCRYPT, salt: salt.toString("hex"), hash: key.toString("hex") };
}
async function verifyPassword(password, rec) {
  const key = await scrypt(password, Buffer.from(rec.salt, "hex"), rec);
  const want = Buffer.from(rec.hash, "hex");
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

class Users {
  constructor(dataDir) { this.file = path.join(dataDir, "users.json"); this.cache = null; }
  async load() {
    let st;
    try { st = await fsp.stat(this.file); } catch (e) { if (e.code === "ENOENT") return { users: {} }; throw e; }
    if (this.cache && this.cache.mtimeMs === st.mtimeMs && this.cache.size === st.size) return this.cache.data;
    const data = (await readJSON(this.file, { users: {} })) || { users: {} };
    this.cache = { mtimeMs: st.mtimeMs, size: st.size, data };
    return data;
  }
  async save(data) {
    await fsp.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFileAtomic(this.file, JSON.stringify(data, null, 2));
    this.cache = null;
  }
  mutate(fn) { return withLock("users", async () => { this.cache = null; const d = await this.load(); const r = await fn(d); await this.save(d); return r; }); }

  async add(login, password) {
    if (!LOGIN_RE.test(login)) throw new Error("login invalide (a-z, 0-9, . _ - ; 40 caractères max)");
    if (String(password).length < 8) throw new Error("mot de passe trop court (8 caractères minimum)");
    const rec = await hashPassword(password);
    await this.mutate((d) => {
      if (d.users[login]) throw new Error("ce login existe déjà");
      d.users[login] = { ...rec, epoch: 1, createdAt: new Date().toISOString() };
    });
  }
  async setPassword(login, password) {
    if (String(password).length < 8) throw new Error("mot de passe trop court (8 caractères minimum)");
    const rec = await hashPassword(password);
    await this.mutate((d) => {
      if (!d.users[login]) throw new Error("login inconnu");
      d.users[login] = { ...d.users[login], ...rec, epoch: (d.users[login].epoch || 1) + 1 };
    });
  }
  async revoke(login) {
    await this.mutate((d) => { if (!d.users[login]) throw new Error("login inconnu"); d.users[login].epoch = (d.users[login].epoch || 1) + 1; });
  }
  async list() { return Object.keys((await this.load()).users).sort(); }

  // Vérifie login + mot de passe. Un login inconnu coûte autant de temps qu'un mot de passe faux
  // (pas d'énumération des comptes par le temps de réponse).
  async check(login, password) {
    const rec = (await this.load()).users[String(login)];
    if (!rec) { await hashPassword(password); return null; }
    return (await verifyPassword(password, rec)) ? { login, epoch: rec.epoch || 1 } : null;
  }
}

async function loadSecret(dataDir) {
  const file = path.join(dataDir, "secret.key");
  try { return Buffer.from((await fsp.readFile(file, "utf8")).trim(), "hex"); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  await fsp.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  try { await fsp.writeFile(file, key.toString("hex"), { mode: 0o600, flag: "wx" }); return key; }
  catch (e) { if (e.code === "EEXIST") return Buffer.from((await fsp.readFile(file, "utf8")).trim(), "hex"); throw e; }
}

const b64 = (b) => Buffer.from(b).toString("base64url");
function signSession(secret, { login, epoch }, ttlMs, now = Date.now()) {
  const body = b64(JSON.stringify({ l: login, ep: epoch, e: now + ttlMs }));
  return body + "." + crypto.createHmac("sha256", secret).update(body).digest("base64url");
}
function readSession(secret, token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 1000) return null;
  const i = token.indexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  const want = crypto.createHmac("sha256", secret).update(body).digest();
  let got;
  try { got = Buffer.from(token.slice(i + 1), "base64url"); } catch (_) { return null; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof o.l !== "string" || typeof o.e !== "number" || o.e < now) return null;
    return { login: o.l, epoch: o.ep };
  } catch (_) { return null; }
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (_) { /* ignore */ } }
  });
  return out;
}
function cookieHeader(value, { secure, maxAgeSec }) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}` + (secure ? "; Secure" : "");
}

// Verrouille un couple (clé) après `max` échecs dans `windowMs`, pour `lockMs`.
class Limiter {
  constructor({ max, windowMs, lockMs }) { Object.assign(this, { max, windowMs, lockMs }); this.map = new Map(); }
  check(key, now = Date.now()) {
    const e = this.map.get(key);
    if (e && e.lockedUntil > now) return { locked: true, retryAfterSec: Math.ceil((e.lockedUntil - now) / 1000) };
    return { locked: false };
  }
  fail(key, now = Date.now()) {
    let e = this.map.get(key);
    if (!e || now - e.first > this.windowMs) e = { first: now, n: 0, lockedUntil: 0 };
    e.n += 1;
    if (e.n >= this.max) e.lockedUntil = now + this.lockMs;
    this.map.set(key, e);
    if (this.map.size > 5000) for (const [k, v] of this.map) if (now - v.first > this.windowMs && v.lockedUntil < now) this.map.delete(k);
  }
  success(key) { this.map.delete(key); }
}

module.exports = { Users, loadSecret, signSession, readSession, parseCookies, cookieHeader, Limiter, hashPassword, verifyPassword, COOKIE };
