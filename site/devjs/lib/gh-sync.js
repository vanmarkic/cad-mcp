/* =========================================================================
   ÉTABLI — synchronisation de la bibliothèque vers une branche git « base ».
   Client minimal de l'API Contents de GitHub : lit/écrit UN fichier JSON sur
   une branche DÉDIÉE qui sert de base de données. Le « push depuis le site
   statique » demandé : aucun serveur, le token (PAT) est fourni par l'appelant
   et n'apparaît jamais en dur. fetch + encode/decode base64 sont injectables
   pour tourner à l'identique dans le navigateur ET sous Node (tests).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.EtabliGhSync = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var API = "https://api.github.com";

  // un chemin de dépôt s'encode segment par segment (on garde les « / »)
  function encodePath(path) {
    return String(path).split("/").map(encodeURIComponent).join("/");
  }

  function createGhSync(deps) {
    deps = deps || {};
    var _fetch = deps.fetch || (typeof fetch !== "undefined" ? fetch : null);
    if (!_fetch) throw new Error("fetch indisponible dans cet environnement");

    // UTF-8 ↔ base64 (défaut navigateur ; Node injecte du Buffer dans les tests)
    var enc = deps.encodeBase64 || function (s) {
      return btoa(unescape(encodeURIComponent(s)));
    };
    var dec = deps.decodeBase64 || function (b) {
      return decodeURIComponent(escape(atob(String(b).replace(/\s/g, ""))));
    };

    function headers(cfg) {
      return {
        "Authorization": "token " + cfg.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
    }

    function requireCfg(cfg) {
      if (!cfg || !cfg.token) throw new Error("Token GitHub manquant");
      if (!cfg.owner || !cfg.repo) throw new Error("« Propriétaire » / « Dépôt » manquants");
      if (!cfg.branch) throw new Error("Branche manquante");
      if (!cfg.path) throw new Error("Chemin du fichier manquant");
    }

    function repoBase(cfg) { return API + "/repos/" + cfg.owner + "/" + cfg.repo; }

    async function bodyOf(res) {
      var text = await res.text();
      try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
    }
    async function fail(res, ctx) {
      var body = await bodyOf(res);
      var msg = (body && body.message) ? body.message : res.statusText;
      var e = new Error("GitHub — " + ctx + " (" + res.status + ") : " + msg);
      e.status = res.status;
      throw e;
    }

    // lit le fichier-base sur la branche → { db, sha } ; { db:null, sha:null } si absent
    async function getDB(cfg) {
      requireCfg(cfg);
      var url = repoBase(cfg) + "/contents/" + encodePath(cfg.path) +
        "?ref=" + encodeURIComponent(cfg.branch);
      var res = await _fetch(url, { headers: headers(cfg) });
      if (res.status === 404) return { db: null, sha: null };
      if (!res.ok) await fail(res, "lecture de la base");
      var body = await bodyOf(res);
      var db = null;
      if (body && body.content) {
        try { db = JSON.parse(dec(body.content)); } catch (e) { db = null; }
      }
      return { db: db, sha: body ? body.sha : null };
    }

    // garantit l'existence de la branche dédiée ; sinon la crée depuis la
    // branche par défaut du dépôt. Retourne true si elle vient d'être créée.
    async function ensureBranch(cfg) {
      requireCfg(cfg);
      var refUrl = repoBase(cfg) + "/git/ref/heads/" + encodeURIComponent(cfg.branch);
      var res = await _fetch(refUrl, { headers: headers(cfg) });
      if (res.ok) return false;
      if (res.status !== 404) await fail(res, "vérification de la branche");

      var repoRes = await _fetch(repoBase(cfg), { headers: headers(cfg) });
      if (!repoRes.ok) await fail(repoRes, "lecture du dépôt");
      var repo = await bodyOf(repoRes);
      var def = (repo && repo.default_branch) || "main";

      var headRes = await _fetch(
        repoBase(cfg) + "/git/ref/heads/" + encodeURIComponent(def),
        { headers: headers(cfg) }
      );
      if (!headRes.ok) await fail(headRes, "lecture de « " + def + " »");
      var head = await bodyOf(headRes);
      var sha = head && head.object ? head.object.sha : null;
      if (!sha) throw new Error("Impossible de lire le sommet de « " + def + " »");

      var createRes = await _fetch(repoBase(cfg) + "/git/refs", {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({ ref: "refs/heads/" + cfg.branch, sha: sha }),
      });
      if (!createRes.ok) await fail(createRes, "création de la branche");
      return true;
    }

    // écrit le fichier-base (création si sha absent, sinon MAJ) → nouveau sha
    async function putDB(cfg, db, sha, message) {
      requireCfg(cfg);
      var payload = {
        message: message || "établi: mise à jour de la bibliothèque",
        content: enc(JSON.stringify(db, null, 2) + "\n"),
        branch: cfg.branch,
      };
      if (sha) payload.sha = sha;
      var res = await _fetch(repoBase(cfg) + "/contents/" + encodePath(cfg.path), {
        method: "PUT",
        headers: headers(cfg),
        body: JSON.stringify(payload),
      });
      if (!res.ok) await fail(res, "écriture de la base");
      var body = await bodyOf(res);
      return body && body.content ? body.content.sha : null;
    }

    // POUSSER : crée la branche au besoin, relit la base distante, fusionne via
    // mergeFn(remote, local), puis écrit. Évite d'écraser le travail d'un autre
    // poste. Retourne { db, sha, branchCreated }.
    async function push(cfg, localDB, mergeFn, message) {
      var branchCreated = await ensureBranch(cfg);
      var cur = await getDB(cfg);
      var merged = mergeFn ? mergeFn(cur.db, localDB) : localDB;
      var sha = await putDB(cfg, merged, cur.sha, message);
      return { db: merged, sha: sha, branchCreated: branchCreated };
    }

    // TIRER : lit la base distante → { db, sha } (db:null si pas encore poussée)
    async function pull(cfg) {
      return getDB(cfg);
    }

    return {
      getDB: getDB,
      ensureBranch: ensureBranch,
      putDB: putDB,
      push: push,
      pull: pull,
    };
  }

  return { createGhSync: createGhSync, encodePath: encodePath };
});
