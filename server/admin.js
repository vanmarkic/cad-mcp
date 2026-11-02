#!/usr/bin/env node
"use strict";
/* Gestion des comptes (à lancer sur le serveur) :
     node admin.js add <login> [--password <mdp>]     crée un compte (mot de passe généré s'il est omis)
     node admin.js passwd <login> [--password <mdp>]  change le mot de passe (déconnecte les sessions)
     node admin.js revoke <login>                     déconnecte toutes les sessions du compte
     node admin.js list
   DATA_DIR : dossier des données (défaut ./data). Le mot de passe généré n'est affiché QU'UNE fois. */
const crypto = require("node:crypto");
const path = require("node:path");
const { Users } = require("./lib/auth.js");

async function main(argv, env = process.env) {
  const [cmd, login, ...rest] = argv;
  const dataDir = path.resolve(env.DATA_DIR || path.join(__dirname, "data"));
  const users = new Users(dataDir);
  const i = rest.indexOf("--password");
  const given = i >= 0 ? rest[i + 1] : null;
  const generated = () => crypto.randomBytes(15).toString("base64url"); // 20 caractères
  if (cmd === "list") { (await users.list()).forEach((l) => console.log(l)); return 0; }
  if (!["add", "passwd", "revoke"].includes(cmd) || !login) {
    console.error("usage : admin.js add|passwd|revoke <login> [--password <mdp>]   |   admin.js list");
    return 2;
  }
  if (cmd === "revoke") { await users.revoke(login); console.log(`sessions de « ${login} » révoquées`); return 0; }
  const password = given || generated();
  if (cmd === "add") await users.add(login, password); else await users.setPassword(login, password);
  console.log(`${cmd === "add" ? "compte créé" : "mot de passe changé"} : ${login}`);
  if (!given) console.log(`mot de passe : ${password}   (notez-le maintenant, il ne sera plus affiché)`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error("erreur :", e.message); process.exit(1); });
}
module.exports = { main };
