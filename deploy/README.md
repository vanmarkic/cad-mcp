# ÉTABLI sur un serveur (Hetzner) — exploitation

ÉTABLI fonctionne de deux façons avec **le même code** :

- **Navigateur seul** (GitHub Pages, fichier local) : les devis restent dans le navigateur (`localStorage`).
  Rien ne change pour ceux qui l'utilisent ainsi.
- **Serveur** (ce dossier) : connexion par identifiant + mot de passe, devis stockés **en fichiers** sur le
  serveur, sans base de données. L'application détecte seule le mode (`GET /api/me`).

```
 navigateur ──HTTPS──▶ Caddy (80/443) ──▶ ÉTABLI (Node, 127.0.0.1:8080)
                                              ├─ site/devjs/      l'application (fichiers statiques)
                                              └─ /var/lib/etabli/ les données
                                                   ├─ users.json  comptes (mots de passe hachés scrypt)
                                                   ├─ secret.key  clé de signature des sessions
                                                   └─ accounts/<login>/{settings,calepinage,catalogue,meta}.json
                                                                       quotes/<id>.json   ← un fichier par devis
 GitHub (public) ◀──tirage toutes les 5 min── update.sh ──▶ releases/<sha> → lien « current » → redémarrage
```

## État de la vérification (à lire)

| Élément | Vérifié ? |
|---|---|
| Serveur : authentification, stockage, conflits, import additif, protections (traversée de répertoire, CSRF, limitation des tentatives, IP invalide, 413) | Oui — 30 tests |
| Application en mode serveur dans un vrai navigateur : connexion, persistance, conflit entre 2 appareils, session expirée, réseau coupé, **migration entre 2 origines** | Oui — 11 tests Playwright |
| `update.sh` (tirage, tests, bascule, retour arrière, nettoyage, verrou) et `backup.sh`, contre un faux GitHub local | Oui — 9 tests |
| Clone partiel + sparse checkout contre le **vrai** dépôt public | Oui (0,6 Mo au lieu de 527 Mo) |
| Caddyfile d'exemple (options A et B) : syntaxe **et** comportement réel (403 hors Cloudflare, proxy depuis une plage autorisée), avec Caddy 2.6.2 | Oui — 5 tests |
| `install.sh`, unités systemd, `cloud-init.yaml`, certificats Let's Encrypt, pare-feu sur un **vrai serveur** | **Non** — syntaxe vérifiée seulement. À essayer sur un serveur jetable d'abord. |
| Un navigateur réel (autre que Chromium) | Non |

## Installation

### Sur un serveur existant (Ubuntu 24.04, Caddy déjà en place)

```bash
curl -fsSL https://raw.githubusercontent.com/vanmarkic/cad-mcp/main/deploy/install.sh -o install.sh
less install.sh && sudo bash install.sh
```
Le script n'installe aucun serveur web et ne modifie pas votre Caddy : il installe Node 22, crée l'utilisateur
système `etabli`, déploie, active le service et les minuteurs (mise à jour, sauvegarde) et affiche la suite.
Puis :

1. `etabli-admin add <login>` — crée le compte, le mot de passe généré s'affiche **une seule fois**.
2. Ajoutez le bloc de `Caddyfile.example` à votre Caddyfile, puis `systemctl reload caddy`.
3. Renseignez `LEGACY_URL` dans `/etc/etabli/env` (voir « Migration »), puis `systemctl restart etabli`.

### Sur un serveur dédié neuf

`cloud-init.yaml` (à coller dans « Cloud config » à la création du serveur, ou via l'API) installe tout :
Caddy, ÉTABLI, pare-feu local, et construit le nom `<ip>.sslip.io`. Il reste à créer le compte.
**Non testé sur un vrai serveur.**

## Nom de domaine : sslip.io ou Cloudflare, pas les deux

- **sslip.io** (`203-0-113-10.sslip.io` → `203.0.113.10`) : aucun DNS à gérer, Caddy obtient le certificat
  Let's Encrypt. Le serveur est alors exposé directement : `TRUST_PROXY=xff`.
- **Derrière Cloudflare** exige un nom de domaine qui est une zone **de votre compte Cloudflare** (impossible avec
  sslip.io : la zone DNS n'est pas à vous). Mise en place :
  1. Cloudflare → DNS : enregistrement **A** `etabli` → IP du serveur, **Proxied** (nuage orange).
  2. Cloudflare → SSL/TLS : mode **Full (strict)**.
  3. Serveur, `/etc/etabli/env` : `TRUST_PROXY=cf`, puis `systemctl restart etabli`.
  4. Serveur : `sudo /opt/etabli/cloudflare-ips.sh` (écrit `/etc/caddy/etabli-cloudflare.caddy`), puis le bloc
     « Option B » de `Caddyfile.example` dans votre Caddyfile, puis `systemctl reload caddy`.
  5. Rafraîchir les plages de temps en temps (elles changent rarement) :
     `0 4 * * 1  root  /opt/etabli/cloudflare-ips.sh && systemctl reload caddy` dans `/etc/cron.d/etabli-cloudflare`.

  **Pourquoi l'étape 4 compte.** ÉTABLI lit l'IP du visiteur dans `CF-Connecting-IP`. Si le serveur répond aussi à
  des connexions directes, cet en-tête est falsifiable : chaque essai de mot de passe peut prétendre venir d'une IP
  différente, et le verrouillage ne se déclenche jamais. Le fichier généré fait répondre **403** à tout ce qui ne
  vient pas d'une plage Cloudflare, avant d'atteindre ÉTABLI, **pour ce site seulement** (les autres sites du même
  Caddy et le pare-feu ne sont pas touchés). Si les plages deviennent périmées, des visiteurs légitimes peuvent
  recevoir un 403 : d'où le rafraîchissement.
  Certificat d'origine : Caddy demande normalement un certificat Let's Encrypt, ce qui doit fonctionner derrière le
  proxy ; si la validation échoue, utilisez un **certificat d'origine Cloudflare** (SSL/TLS → Origin Server) à la place.

## Comptes

```
etabli-admin add <login> [--password <mdp>]    # crée (mot de passe généré s'il est omis)
etabli-admin passwd <login> [--password <mdp>] # change le mot de passe et déconnecte les sessions
etabli-admin revoke <login>                    # déconnecte toutes les sessions du compte
etabli-admin list
```
Chaque compte a ses données dans `accounts/<login>/` : un compte ne voit jamais celles d'un autre.
Il n'y a pas (encore) de changement de mot de passe par l'utilisateur lui-même : c'est `etabli-admin passwd`.

## Migration depuis l'ancienne adresse (1re connexion)

Le navigateur isole le stockage par adresse : le serveur **ne peut pas lire** le `localStorage` de l'ancienne
adresse. D'où une page de transfert, `migrate.html`, servie par l'**ancienne** adresse :

1. Dans `/etc/etabli/env` : `LEGACY_URL=https://…/devjs/` (adresse actuelle d'ÉTABLI), puis `systemctl restart etabli`.
2. Dans le dépôt : `site/devjs/migrate-config.js` → `window.ETABLI_MIGRATE_TARGETS = ["https://<ip>.sslip.io"];`
   (l'origine du **nouveau** serveur), à fusionner dans `main` pour que GitHub Pages republie.
3. À la première connexion, ÉTABLI propose « Récupérer mes données » : une fenêtre s'ouvre sur l'ancienne
   adresse, l'utilisateur **confirme** (la page affiche vers quelle adresse partiront les données), et le
   serveur les **ajoute** : rien d'existant n'est écrasé, rien n'est supprimé à l'ancienne adresse.

Garde-fous : l'ancienne page n'envoie qu'à une origine de la liste, que sur clic, et que vers cette origine ;
le serveur n'accepte les messages que de l'origine et de la fenêtre attendues. Rejouable depuis
*Réglages → Ancienne adresse* (additif : un devis déjà présent est ignoré, un devis modifié devient une copie).
Un utilisateur dont les devis sont sur plusieurs navigateurs doit répéter l'opération depuis chacun.

## Mises à jour automatiques

`etabli-update.timer` lance `update.sh` toutes les 5 minutes : il récupère le dernier commit de `main`
(dépôt **public**, aucune clé), lance les tests unitaires, bascule le lien `current` et redémarre ; si les tests
échouent ou si le service ne répond pas, **l'ancienne version reste (ou revient)** et le commit est noté mauvais
(`/opt/etabli/bad/<sha>` + journal), sans réessai tant qu'un nouveau commit n'arrive pas.

```
journalctl -u etabli-update -n 50          # historique des mises à jour
systemctl list-timers 'etabli-*'           # prochains passages
rm /opt/etabli/bad/<sha>                   # forcer un nouvel essai d'un commit jugé mauvais
```
**Tout ce qui est fusionné dans `main` est exécuté sur le serveur** (et a accès aux données). Activez la
double authentification sur le compte GitHub. Pour garder la main sur les mises en production, suivez une autre
branche (`BRANCH=prod` dans `/etc/etabli/env`) que vous faites avancer à la demande.
`update.sh` lui-même n'est pas mis à jour automatiquement : relancez `install.sh` pour le renouveler.

## Sauvegardes

`backup.sh` archive `/var/lib/etabli` chaque nuit dans `/var/backups/etabli` (14 jours, droits 600).
**C'est le même disque que les données** : ce n'est pas une sauvegarde contre la perte du serveur. Ajoutez au moins
une copie ailleurs (option « Backups » de Hetzner, ou `rsync` vers un autre serveur). Les archives contiennent la
clé de session et les empreintes des mots de passe : protégez-les comme les données.
Restauration : `systemctl stop etabli`, extraire l'archive dans `/var/lib`, `chown -R etabli:etabli /var/lib/etabli`,
`systemctl start etabli`.

## Sécurité : en place / à votre charge

**En place** : mots de passe hachés (scrypt, sel aléatoire), jamais écrits en clair ; session par cookie signé
`HttpOnly` + `SameSite=Lax` + `Secure` ; 5 échecs de connexion = verrouillage 15 min (par IP+identifiant, et par IP) ;
même message d'erreur pour un identifiant inconnu ou un mot de passe faux ; contrôle d'origine (anti-CSRF) ;
identifiants de fichiers validés (pas de traversée de répertoire) ; écritures atomiques ; en-têtes CSP, HSTS,
anti-framing ; seuls `index.html`, `migrate.html` et `lib/*.js` sont servis ; service systemd durci
(écriture limitée à `/var/lib/etabli`, 512 Mo de mémoire max).

**À votre charge** :
- HTTPS (Caddy) et le choix sslip.io / domaine (voir plus haut) ; pare-feu (Hetzner Cloud Firewall et/ou `ufw`).
  Sur un serveur qui héberge d'autres services, les données d'ÉTABLI partagent leur exposition : un serveur dédié
  est plus sûr.
- Données personnelles : les devis contiennent nom, adresse, e-mail et téléphone de clients finaux. Hébergement
  dans l'UE (Falkenstein, Allemagne), accès par compte, sauvegardes : à documenter pour votre client
  (responsable de traitement / sous-traitant). Ce n'est pas un avis juridique.
- Mot de passe du client : transmettez-le par un autre canal que l'identifiant.

## Limites connues

Un seul serveur (pas de haute disponibilité) ; pas de mode hors connexion (un réseau coupé affiche un bandeau et
la saisie reste à l'écran) ; deux appareils sur le même devis : le second est averti d'un conflit et rien n'est
écrasé, mais il n'y a pas de fusion automatique ; pas de réinitialisation du mot de passe en libre-service.

## Tests

```bash
cd server && npm test                              # serveur (30 tests, sans réseau)
cd site/devjs && npm run test:unit                 # noyau + couche de stockage (hors ligne)
cd site/devjs && npm run test:ui                   # navigateur : mode local + mode serveur (Playwright)
node --test deploy/test/*.test.js                  # update.sh / backup.sh (faux GitHub local) et cloudflare-ips.sh (Caddy si installé)
```
