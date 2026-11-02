"use strict";
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../app.js");

// Démarre un vrai serveur HTTP sur un port libre, avec un dossier de données temporaire.
async function boot(opts = {}) {
  const dir = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), "etabli-srv-"));
  const staticDir = opts.staticDir || path.join(__dirname, "..", "..", "site", "devjs");
  const app = createApp({ dataDir: dir, staticDir, cookieSecure: false, log: false, ...opts.cfg });
  await app.ready;
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  return { app, dir, base, server, close: () => new Promise((r) => server.close(r)) };
}

// Client minimal avec « pot à cookies ».
function client(base) {
  let cookie = "";
  async function call(method, url, body, headers) {
    const h = { ...(headers || {}) };
    if (body !== undefined && !h["Content-Type"]) h["Content-Type"] = "application/json";
    if (cookie) h.Cookie = cookie;
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)), redirect: "manual" });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) { const pair = c.split(";")[0]; if (/^[^=]+=$/.test(pair)) cookie = ""; else cookie = pair; }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (_) { /* pas du JSON */ }
    return { status: res.status, headers: res.headers, text, json, setCookie: set };
  }
  return {
    get: (u, h) => call("GET", u, undefined, h),
    post: (u, b, h) => call("POST", u, b === undefined ? {} : b, h),
    put: (u, b, h) => call("PUT", u, b, h),
    del: (u, h) => call("DELETE", u, undefined, h),
    raw: call,
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
  };
}

const quote = (over) => ({
  id: "q_test_1", numero: "DEV-2026-001", dateISO: "2026-11-02",
  client: { nom: "Alice", adresse: "", email: "", tel: "" }, chantier: "", clientType: "particulier", tvaRate: 6,
  acompte: "30", validite: "30", conditions: "", lines: [{ id: "l1", type: "forfait", designation: "Forfait", pa: "100", marge: "10" }],
  ...over,
});

module.exports = { boot, client, quote };
