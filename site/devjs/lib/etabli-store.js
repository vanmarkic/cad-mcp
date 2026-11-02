/* =========================================================================
   ÉTABLI — couche de stockage. Deux implémentations derrière la MÊME interface :
     createLocalStore(storage)  — navigateur seul (localStorage), comportement historique
                                  (GitHub Pages, fichier local) ;
     createServerStore(fetch)   — serveur ÉTABLI : connexion, devis en fichiers côté serveur.
   `detectBackend(fetch)` choisit : si /api/me répond (200 ou 401 JSON), on est sur le serveur.
   Aucun DOM : testable sous Node avec un faux fetch (voir test/store.test.js).
   Les méthodes d'écriture ne LÈVENT PAS : elles rendent { ok:true } ou
   { ok:false, kind:"auth"|"conflict"|"network"|"server", message, conflicts? }.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.EtabliStore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = { settings: "etabli:settings", quotes: "etabli:quotes", calepinage: "etabli:calepinage", catalogue: "etabli:catalogue" };
  var OK = { ok: true };
  function fail(kind, message, extra) {
    var r = { ok: false, kind: kind, message: message };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  /* ---------- local : localStorage via l'API { get(key), set(key, value) } ---------- */
  function createLocalStore(storage) {
    function read(key) {
      return Promise.resolve(storage.get(key)).then(function (r) {
        if (!r || r.value == null) return null;
        try { return JSON.parse(r.value); } catch (e) { return null; }
      }, function () { return null; });
    }
    function write(key, value) {
      return Promise.resolve(storage.set(key, JSON.stringify(value))).then(function () { return OK; }, function (e) {
        return fail("server", "Écriture locale impossible : " + (e && e.message ? e.message : e));
      });
    }
    return {
      mode: "local",
      loadAll: function () {
        return Promise.all([read(KEYS.settings), read(KEYS.quotes), read(KEYS.calepinage), read(KEYS.catalogue)]).then(function (a) {
          return { settings: a[0], quotes: Array.isArray(a[1]) ? a[1] : [], calepinage: a[2], catalogue: Array.isArray(a[3]) ? a[3] : [] };
        });
      },
      saveSettings: function (v) { return write(KEYS.settings, v); },
      saveCalepinage: function (v) { return write(KEYS.calepinage, v); },
      saveCatalog: function (list) { return write(KEYS.catalogue, list); },
      syncQuotes: function (prev, next) { return write(KEYS.quotes, next); },
    };
  }

  /* ---------- serveur ---------- */
  function createServerStore(fetchFn, onUnauthorized) {
    var revs = {}; // id → dernière révision connue du devis (détection des conflits)

    // → { status, json } ; lève { network:true } si le serveur est injoignable
    function call(method, url, body) {
      var init = { method: method, credentials: "same-origin", headers: {} };
      if (method === "POST" || method === "PUT") { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body === undefined ? {} : body); }
      return Promise.resolve().then(function () { return fetchFn(url, init); }).then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) { /* pas du JSON */ }
          return { status: res.status, json: json, headers: res.headers };
        });
      }, function () { throw { network: true }; });
    }
    function toFailure(e, r) {
      if (e && e.network) return fail("network", "Serveur injoignable. Vérifiez votre connexion.");
      if (r && r.status === 401) { if (onUnauthorized) onUnauthorized(); return fail("auth", "Session expirée : reconnectez-vous."); }
      if (r && r.status === 409) return fail("conflict", "Ce devis a été modifié depuis un autre appareil.");
      return fail("server", (r && r.json && r.json.error) || ("Erreur serveur (" + (r ? r.status : "?") + ")"));
    }
    function put(url, body) {
      return call("PUT", url, body).then(function (r) { return r.status === 200 ? OK : toFailure(null, r); }, function (e) { return toFailure(e); });
    }

    return {
      mode: "server",

      me: function () { return call("GET", "/api/me").then(function (r) { return r.status === 200 ? r.json : null; }, function () { return null; }); },

      login: function (login, password) {
        return call("POST", "/api/login", { login: login, password: password }).then(function (r) {
          if (r.status === 200) return { ok: true, login: r.json && r.json.login };
          if (r.status === 429) return fail("locked", (r.json && r.json.error) || "Trop de tentatives.", { retryAfter: Number(r.headers && r.headers.get && r.headers.get("retry-after")) || 0 });
          if (r.status === 401) return fail("auth", (r.json && r.json.error) || "Identifiant ou mot de passe incorrect");
          return fail("server", (r.json && r.json.error) || ("Erreur serveur (" + r.status + ")"));
        }, function (e) { return toFailure(e); });
      },
      logout: function () { return call("POST", "/api/logout", {}).then(function () { return OK; }, function () { return OK; }); },

      // Charge tout (réglages, devis, catalogue, calepinage). Lève { kind, message } si impossible.
      loadAll: function () {
        return call("GET", "/api/data").then(function (r) {
          if (r.status !== 200 || !r.json) throw toFailure(null, r);
          revs = {};
          var quotes = (r.json.quotes || []).map(function (q) {
            var c = {}; for (var k in q) if (k !== "_rev") c[k] = q[k];
            revs[c.id] = q._rev;
            return c;
          });
          return { settings: r.json.settings, quotes: quotes, calepinage: r.json.calepinage, catalogue: r.json.catalogue || [], migrated: !!r.json.migrated };
        }, function (e) { throw toFailure(e); });
      },

      saveSettings: function (v) { return put("/api/settings", { value: v }); },
      saveCalepinage: function (v) { return put("/api/calepinage", { value: v }); },
      saveCatalog: function (list) { return put("/api/catalogue", { value: list }); },

      // Reporte sur le serveur la DIFFÉRENCE entre deux listes de devis (ajout / modification / suppression).
      syncQuotes: function (prev, next) {
        prev = prev || []; next = next || [];
        var before = {}, after = {}, ops = [], i;
        for (i = 0; i < prev.length; i++) if (prev[i] && prev[i].id != null) before[prev[i].id] = prev[i];
        for (i = 0; i < next.length; i++) if (next[i] && next[i].id != null) after[next[i].id] = next[i];
        for (i = 0; i < next.length; i++) {
          var q = next[i];
          if (!q || q.id == null) continue;
          var old = before[q.id];
          if (old === q || (old && JSON.stringify(old) === JSON.stringify(q))) continue;
          ops.push({ kind: "put", id: q.id, quote: q });
        }
        for (i = 0; i < prev.length; i++) if (prev[i] && prev[i].id != null && !after.hasOwnProperty(prev[i].id)) ops.push({ kind: "del", id: prev[i].id });

        var conflicts = [], firstError = null;
        return ops.reduce(function (chain, op) {
          return chain.then(function () {
            if (firstError) return null;
            var url = "/api/quotes/" + encodeURIComponent(op.id);
            if (op.kind === "del") {
              return call("DELETE", url).then(function (r) {
                if (r.status === 200) { delete revs[op.id]; return null; }
                firstError = toFailure(null, r); return null;
              }, function (e) { firstError = toFailure(e); });
            }
            return call("PUT", url, { quote: op.quote, baseRev: revs.hasOwnProperty(op.id) ? revs[op.id] : null }).then(function (r) {
              if (r.status === 200 && r.json) { revs[op.id] = r.json.rev; return null; }
              if (r.status === 409) { conflicts.push(op.id); return null; }
              firstError = toFailure(null, r); return null;
            }, function (e) { firstError = toFailure(e); });
          });
        }, Promise.resolve()).then(function () {
          if (firstError) return firstError;
          if (conflicts.length) return fail("conflict", "Ce devis a été modifié depuis un autre appareil : rechargez la page pour récupérer la version du serveur (vos modifications ne sont pas enregistrées).", { conflicts: conflicts });
          return OK;
        });
      },

      // Migration / restauration additive : le serveur n'écrase rien (voir server/lib/store.js).
      importBackup: function (backup) {
        return call("POST", "/api/import", { backup: backup }).then(function (r) {
          return r.status === 200 ? { ok: true, summary: r.json } : toFailure(null, r);
        }, function (e) { return toFailure(e); });
      },
      skipMigration: function () { return call("POST", "/api/migrated", {}).then(function (r) { return r.status === 200 ? OK : toFailure(null, r); }, function (e) { return toFailure(e); }); },
    };
  }

  // Sur le serveur ÉTABLI, /api/me répond 200 (connecté) ou 401 JSON (à connecter). Ailleurs
  // (GitHub Pages, fichier local, simple serveur statique) : 404 / réseau / autre → mode local.
  function detectBackend(fetchFn) {
    return Promise.resolve().then(function () { return fetchFn("/api/me", { credentials: "same-origin" }); }).then(function (res) {
      var ct = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
      if (res.status === 200 && /json/i.test(ct)) return res.json().then(function (me) { return { mode: "server", authed: true, me: me }; });
      if (res.status === 401 && /json/i.test(ct)) return { mode: "server", authed: false, me: null };
      return { mode: "local" };
    }, function () { return { mode: "local" }; });
  }

  return { createLocalStore: createLocalStore, createServerStore: createServerStore, detectBackend: detectBackend, KEYS: KEYS };
});
