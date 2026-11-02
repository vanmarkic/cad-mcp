"use strict";
/* Point d'entrée. Configuration par variables d'environnement :
     PORT=8080  HOST=127.0.0.1  DATA_DIR=./data  STATIC_DIR=../site/devjs
     COOKIE_SECURE=1 (mettre 0 uniquement en test local sans HTTPS)
     TRUST_PROXY=0|xff|cf   (IP réelle du client derrière Caddy / Cloudflare)
     LEGACY_URL=https://…/devjs/   (ancienne adresse, pour la migration à la 1re connexion)
     SESSION_DAYS=30
     EDGE_SECRET=<24+ caractères>   secret partagé avec Cloudflare (en-tête X-Etabli-Edge) ; sans lui : 403 */
const http = require("node:http");
const path = require("node:path");
const { createApp } = require("./app.js");

function configFromEnv(env = process.env) {
  if (env.EDGE_SECRET && env.EDGE_SECRET.length < 24) {
    throw new Error("EDGE_SECRET trop court (24 caractères minimum) : générez-le avec « openssl rand -hex 32 »");
  }
  return {
    port: Number(env.PORT) || 8080,
    host: env.HOST || "127.0.0.1",
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, "data")),
    staticDir: path.resolve(env.STATIC_DIR || path.join(__dirname, "..", "site", "devjs")),
    cookieSecure: env.COOKIE_SECURE !== "0",
    trustProxy: env.TRUST_PROXY || "0",
    legacyUrl: env.LEGACY_URL || "",
    sessionDays: Number(env.SESSION_DAYS) || 30,
    edgeSecret: env.EDGE_SECRET || "",
  };
}

function startServer(cfg) {
  const app = createApp(cfg);
  const server = http.createServer(app.handler);
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  return new Promise((resolve) => server.listen(cfg.port, cfg.host, () => resolve({ server, app })));
}

if (require.main === module) {
  const cfg = configFromEnv();
  startServer(cfg).then(({ server }) => {
    const a = server.address();
    console.log(`ÉTABLI écoute sur http://${a.address}:${a.port} — données : ${cfg.dataDir}`);
    const stop = () => server.close(() => process.exit(0));
    process.on("SIGTERM", stop); process.on("SIGINT", stop);
  });
}

module.exports = { configFromEnv, startServer };
