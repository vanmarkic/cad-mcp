"use strict";
/* Stockage en FICHIERS (aucune base de données).
     <DATA_DIR>/accounts/<login>/settings.json | calepinage.json | catalogue.json | meta.json
     <DATA_DIR>/accounts/<login>/quotes/<id>.json   →  { "rev": n, "quote": {…} }
   Écritures atomiques (fichier temporaire + fsync + rename) : un crash ne laisse jamais
   un devis à moitié écrit. Un verrou par clé sérialise les lectures-modifications-écritures. */
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Core = require("../../site/devjs/lib/etabli-core.js");

// Doit commencer par un caractère « sûr » : exclut "." et ".." (traversée de répertoire).
const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const DOCS = { settings: "object", calepinage: "object", catalogue: "array" };

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

async function writeFileAtomic(file, data) {
  const tmp = file + ".tmp-" + process.pid + "-" + crypto.randomBytes(6).toString("hex");
  const fh = await fsp.open(tmp, "w", 0o600);
  try { await fh.writeFile(data); await fh.sync(); } finally { await fh.close(); }
  await fsp.rename(tmp, file);
  try { const d = await fsp.open(path.dirname(file), "r"); try { await d.sync(); } finally { await d.close(); } } catch (_) { /* best effort */ }
}

const tails = new Map();
function withLock(key, fn) {
  const prev = tails.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  tails.set(key, tail);
  tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}

async function readJSON(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

class Store {
  constructor(dataDir) { this.dir = dataDir; }

  async init() { await fsp.mkdir(path.join(this.dir, "accounts"), { recursive: true, mode: 0o700 }); }

  accountDir(login) {
    if (!LOGIN_RE.test(String(login))) throw new Error("login invalide");
    return path.join(this.dir, "accounts", login);
  }

  /* ---------- documents (réglages, calepinage, catalogue) ---------- */
  async getDoc(login, name) {
    if (!DOCS[name]) throw new Error("document inconnu");
    return readJSON(path.join(this.accountDir(login), name + ".json"), null);
  }
  async setDoc(login, name, value) {
    const kind = DOCS[name];
    if (!kind) throw new Error("document inconnu");
    if (kind === "object" ? !isObj(value) : !Array.isArray(value)) throw new Error("format invalide : " + name);
    const dir = this.accountDir(login);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    await withLock(login + ":doc:" + name, () => writeFileAtomic(path.join(dir, name + ".json"), JSON.stringify(value)));
  }

  async getMeta(login) { return (await readJSON(path.join(this.accountDir(login), "meta.json"), null)) || { migrated: false }; }
  async setMeta(login, meta) {
    const dir = this.accountDir(login);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    await withLock(login + ":meta", () => writeFileAtomic(path.join(dir, "meta.json"), JSON.stringify(meta)));
  }

  /* ---------- devis : un fichier par devis ---------- */
  quotePath(login, id) {
    if (!ID_RE.test(String(id))) throw new Error("id invalide");
    return path.join(this.accountDir(login), "quotes", id + ".json");
  }

  async listQuotes(login) {
    const dir = path.join(this.accountDir(login), "quotes");
    let names;
    try { names = await fsp.readdir(dir); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
    const out = [];
    for (const n of names) {
      if (!n.endsWith(".json")) continue; // ignore les temporaires « .json.tmp-… »
      try {
        const o = JSON.parse(await fsp.readFile(path.join(dir, n), "utf8"));
        if (o && isObj(o.quote)) out.push({ ...o.quote, _rev: o.rev });
      } catch (e) { console.error("devis illisible ignoré :", n, e.message); }
    }
    out.sort((a, b) => String(b._savedAt || "").localeCompare(String(a._savedAt || "")));
    return out;
  }

  // baseRev : révision que le client a lue (null = « je crée »). Conflit si elle a changé.
  async putQuote(login, id, quote, baseRev) {
    const file = this.quotePath(login, id);
    const dir = path.dirname(file);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    return withLock(login + ":quote:" + id, async () => {
      const cur = await readJSON(file, null);
      if (cur && cur.rev !== baseRev) return { conflict: true, currentRev: cur.rev };
      // (devis absent mais baseRev fourni : supprimé ailleurs → on recrée, on ne perd pas la saisie)
      const clean = { ...quote };
      delete clean._rev;
      const rev = (cur ? cur.rev : 0) + 1;
      await writeFileAtomic(file, JSON.stringify({ rev, quote: clean }));
      return { conflict: false, rev };
    });
  }

  async deleteQuote(login, id) {
    const file = this.quotePath(login, id);
    await withLock(login + ":quote:" + id, async () => {
      try { await fsp.unlink(file); } catch (e) { if (e.code !== "ENOENT") throw e; }
    });
  }

  async allData(login) {
    const [settings, calepinage, catalogue, quotes, meta] = await Promise.all([
      this.getDoc(login, "settings"), this.getDoc(login, "calepinage"), this.getDoc(login, "catalogue"),
      this.listQuotes(login), this.getMeta(login),
    ]);
    return { settings, calepinage, catalogue: catalogue || [], quotes, migrated: !!meta.migrated };
  }

  /* ---------- import ADDITIF (migration depuis l'ancienne adresse, ou sauvegarde) ----------
     N'écrase rien de ce que le serveur contient déjà :
       devis        — id inconnu → ajouté ; même id et même contenu → ignoré ; même id mais
                      contenu différent → ajouté comme copie (nouvel id) ;
       catalogue    — ajoute les désignations absentes ;
       réglages / calepinage — repris seulement s'il n'y en a pas encore. */
  async importBackup(login, backup) {
    if (!isObj(backup)) throw new Error("Ce fichier n'est pas une sauvegarde Établi.");
    const r = Core.readBackup(backup); // lève une erreur claire si ce n'est pas une sauvegarde Établi
    return withLock(login + ":import", async () => {
      const summary = { quotes: { added: 0, duplicates: 0, copies: 0, skipped: 0 }, catalogue: { added: 0 }, settings: false, calepinage: false };
      let list = (await this.listQuotes(login)).map((q) => { const c = { ...q }; delete c._rev; return c; });
      for (const raw of r.quotes) {
        if (!isObj(raw) || !Array.isArray(raw.lines)) { summary.quotes.skipped++; continue; }
        const q = { ...raw };
        delete q._rev;
        if (typeof q.id !== "string" || !ID_RE.test(q.id)) q.id = Core.newQuoteId();
        const res = Core.addImportedQuote(list, q);
        if (res.status === "duplicate") { summary.quotes.duplicates++; continue; }
        await this.putQuote(login, res.quote.id, res.quote, null);
        list = res.list;
        if (res.status === "copy") summary.quotes.copies++; else summary.quotes.added++;
      }
      const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
      let cat = (await this.getDoc(login, "catalogue")) || [];
      const have = new Set(cat.map((x) => norm(x && x.designation)));
      const usedIds = new Set(cat.map((x) => x && x.id));
      for (const it of r.catalogue) {
        if (!isObj(it) || !norm(it.designation) || have.has(norm(it.designation))) continue;
        const item = { ...it };
        if (!item.id || usedIds.has(item.id)) item.id = Core.newCatalogItemId();
        cat = [item].concat(cat);
        have.add(norm(item.designation)); usedIds.add(item.id);
        summary.catalogue.added++;
      }
      if (summary.catalogue.added) await this.setDoc(login, "catalogue", cat);
      if (isObj(r.settings) && (await this.getDoc(login, "settings")) === null) { await this.setDoc(login, "settings", r.settings); summary.settings = true; }
      if (isObj(r.calepinage) && (await this.getDoc(login, "calepinage")) === null) { await this.setDoc(login, "calepinage", r.calepinage); summary.calepinage = true; }
      await this.setMeta(login, { migrated: true, migratedAt: new Date().toISOString() });
      return summary;
    });
  }
}

module.exports = { Store, ID_RE, LOGIN_RE, writeFileAtomic, readJSON, withLock };
