/* ÉTABLI — service worker (application installable, ouverture sans réseau).
   - API (/api/…) et requêtes autres que GET : JAMAIS interceptées ni mises en cache (données des clients,
     connexion, enregistrements passent toujours par le réseau).
   - Fichiers de l'application (même origine) : réseau d'abord — une mise à jour est vue dès qu'elle est en
     ligne — et copie de secours si le réseau manque.
   - Bibliothèques et polices (unpkg, Google Fonts) : copie en cache servie tout de suite, rafraîchie en fond.
   Changer VERSION purge les anciens caches.
   ⚠ À CHAQUE modification de lib/*.js : incrémenter VERSION ET le « ?v= » des <script src="lib/…"> d'index.html et
   migrate.html (un test le vérifie). Sinon un cache intermédiaire (Cloudflare impose 4 h de cache navigateur aux .js)
   peut servir l'ancien moteur avec la nouvelle page → « … is not a function ». */
const VERSION = "etabli-v2";
const REV = VERSION.replace(/^etabli-v/, "");
const SHELL = ["./", "./index.html", "./lib/etabli-core.js?v=" + REV, "./lib/etabli-store.js?v=" + REV, "./manifest.webmanifest", "./icons/icon-192.png"];
// Mêmes adresses que les <script> d'index.html : préchargées pour que l'application s'ouvre hors ligne dès la 2ᵉ visite.
const CDN = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7/babel.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => Promise.all(SHELL.concat(CDN).map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => null)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.includes("/api/")) return; // jamais de cache pour l'API
  if (sameOrigin) {
    event.respondWith(
      // « no-cache » : toujours revalider auprès du serveur (ne jamais servir un fichier périmé du cache HTTP du navigateur)
      fetch(req, req.mode === "navigate" ? undefined : { cache: "no-cache" }).then((res) => {
        if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))
      )
    );
    return;
  }
  if (/^(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    event.respondWith(
      caches.open(VERSION).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
