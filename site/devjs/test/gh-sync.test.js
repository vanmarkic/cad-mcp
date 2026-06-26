"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGhSync } = require("../lib/gh-sync.js");

/* Base64 UTF-8 via Buffer (le navigateur utilise btoa/atob ; ici on injecte). */
const deps = (fetchImpl) => ({
  fetch: fetchImpl,
  encodeBase64: (s) => Buffer.from(s, "utf8").toString("base64"),
  decodeBase64: (b) => Buffer.from(String(b).replace(/\s/g, ""), "base64").toString("utf8"),
});

const CFG = { token: "tok", owner: "o", repo: "r", branch: "etabli-db", path: "etabli/refs.json" };

// petit faux fetch : associe une réponse à chaque (method + url substring),
// enregistre tous les appels pour les assertions.
function stub(routes) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    opts = opts || {};
    const method = opts.method || "GET";
    calls.push({ url, method, opts });
    for (const route of routes) {
      if (method === route.method && url.indexOf(route.match) !== -1) {
        return makeRes(route);
      }
    }
    return makeRes({ status: 404, body: { message: "Not Found" } });
  };
  return { fetchImpl, calls };
}
function makeRes(r) {
  const status = r.status == null ? 200 : r.status;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: r.statusText || "",
    text: async () => (r.body == null ? "" : JSON.stringify(r.body)),
  };
}
const b64 = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");

/* ---------------------------------------------------------------- getDB */
test("getDB: decodes base64 JSON content and returns the sha", async () => {
  const db = { version: 1, materials: [{ id: "m-1" }], pieces: [] };
  const { fetchImpl } = stub([
    { method: "GET", match: "/contents/etabli/refs.json", body: { content: b64(db), sha: "SHA1" } },
  ]);
  const gh = createGhSync(deps(fetchImpl));
  const got = await gh.getDB(CFG);
  assert.deepEqual(got.db, db);
  assert.equal(got.sha, "SHA1");
});

test("getDB: missing file (404) → { db:null, sha:null }", async () => {
  const { fetchImpl } = stub([
    { method: "GET", match: "/contents/", status: 404, body: { message: "Not Found" } },
  ]);
  const gh = createGhSync(deps(fetchImpl));
  const got = await gh.getDB(CFG);
  assert.equal(got.db, null);
  assert.equal(got.sha, null);
});

test("getDB: rejects without a token", async () => {
  const gh = createGhSync(deps(async () => makeRes({})));
  await assert.rejects(() => gh.getDB({ ...CFG, token: "" }), /Token GitHub manquant/);
});

/* --------------------------------------------------------- ensureBranch */
test("ensureBranch: existing branch → false, no creation", async () => {
  const { fetchImpl, calls } = stub([
    { method: "GET", match: "/git/ref/heads/etabli-db", body: { object: { sha: "x" } } },
  ]);
  const gh = createGhSync(deps(fetchImpl));
  const created = await gh.ensureBranch(CFG);
  assert.equal(created, false);
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
});

test("ensureBranch: missing branch → creates it from the default branch head", async () => {
  const { fetchImpl, calls } = stub([
    { method: "GET", match: "/git/ref/heads/etabli-db", status: 404, body: { message: "Not Found" } },
    { method: "GET", match: "/git/ref/heads/main", body: { object: { sha: "BASE_SHA" } } },
    { method: "GET", match: "/repos/o/r", body: { default_branch: "main" } },
    { method: "POST", match: "/git/refs", status: 201, body: { ref: "refs/heads/etabli-db" } },
  ]);
  const gh = createGhSync(deps(fetchImpl));
  const created = await gh.ensureBranch(CFG);
  assert.equal(created, true);
  const post = calls.find((c) => c.method === "POST" && c.url.indexOf("/git/refs") !== -1);
  assert.ok(post, "a POST /git/refs was issued");
  const sent = JSON.parse(post.opts.body);
  assert.equal(sent.ref, "refs/heads/etabli-db");
  assert.equal(sent.sha, "BASE_SHA");
});

/* ----------------------------------------------------------------- putDB */
test("putDB: PUTs base64 content with sha + branch", async () => {
  const { fetchImpl, calls } = stub([
    { method: "PUT", match: "/contents/etabli/refs.json", body: { content: { sha: "NEW_SHA" } } },
  ]);
  const gh = createGhSync(deps(fetchImpl));
  const sha = await gh.putDB(CFG, { version: 1, materials: [], pieces: [] }, "OLD_SHA", "msg");
  assert.equal(sha, "NEW_SHA");
  const put = calls.find((c) => c.method === "PUT");
  const sent = JSON.parse(put.opts.body);
  assert.equal(sent.sha, "OLD_SHA");
  assert.equal(sent.branch, "etabli-db");
  assert.equal(sent.message, "msg");
  // content round-trips through base64
  assert.match(Buffer.from(sent.content, "base64").toString("utf8"), /"version": 1/);
});

test("putDB: surfaces a GitHub error message", async () => {
  const { fetchImpl } = stub([
    { method: "PUT", match: "/contents/", status: 409, body: { message: "is at ... but expected" } },
  ]);
  const gh = createGhSync(deps(fetchImpl));
  await assert.rejects(() => gh.putDB(CFG, {}, "SHA", "m"), /409.*expected/);
});

/* ------------------------------------------------------------------ push */
test("push: ensures branch, merges remote+local, then writes the merge", async () => {
  const remoteDB = { version: 1, materials: [{ id: "m-remote", updatedAt: "t1" }], pieces: [] };
  const { fetchImpl, calls } = stub([
    { method: "GET", match: "/git/ref/heads/etabli-db", body: { object: { sha: "x" } } }, // branch exists
    { method: "GET", match: "/contents/etabli/refs.json", body: { content: b64(remoteDB), sha: "CUR" } },
    { method: "PUT", match: "/contents/etabli/refs.json", body: { content: { sha: "NEW" } } },
  ]);
  const gh = createGhSync(deps(fetchImpl));
  const localDB = { version: 1, materials: [{ id: "m-local", updatedAt: "t2" }], pieces: [] };
  const mergeFn = (remote, local) => ({
    version: 1,
    materials: [...(remote.materials || []), ...(local.materials || [])],
    pieces: [],
  });
  const res = await gh.push(CFG, localDB, mergeFn, "msg");
  assert.equal(res.branchCreated, false);
  assert.equal(res.sha, "NEW");
  assert.equal(res.db.materials.length, 2); // remote + local merged
  // the PUT carried the merged db (with the previous sha for a clean update)
  const put = calls.find((c) => c.method === "PUT");
  const sent = JSON.parse(put.opts.body);
  assert.equal(sent.sha, "CUR");
  const written = JSON.parse(Buffer.from(sent.content, "base64").toString("utf8"));
  assert.equal(written.materials.length, 2);
});
