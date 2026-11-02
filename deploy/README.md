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
| Serveur : authentification, stockage, conflits, import additif, protections (traversée de répertoire, CSRF, limitation des tentatives, IP invalide, secret d'origine EDGE_SECRET, 413) | Oui — 33 tests |
| Application en mode serveur dans un vrai navigateur : connexion, persistance, conflit entre 2 appareils, session expirée, réseau coupé, **migration entre 2 origines** | Oui — 11 tests Playwright |
| `update.sh` (tirage, tests, bascule, retour arrière, nettoyage, verrou) et `backup.sh`, contre un faux GitHub local (dont le contrôle de santé sur HOST/PORT) | Oui — 11 tests |
| Clone partiel + sparse checkout contre le **vrai** dépôt public | Oui (0,6 Mo au lieu de 527 Mo) |
| Caddyfile d'exemple (options A et B) : syntaxe **et** comportement réel (403 hors Cloudflare, proxy depuis une plage autorisée), avec Caddy 2.6.2, plus le bloc Coolify et la preuve qu'un fragment est invalide au niveau global | Oui — 7 tests |
| `install.sh`, unités systemd, `cloud-init.yaml`, certificats Let's Encrypt, pare-feu, **proxy Coolify** (chemins fournis par l'exploitant, non éprouvés par moi) sur un **vrai serveur** | **Non** — syntaxe vérifiée seulement. À essayer sur un serveur jetable d'abord. |
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
2. Ajoutez le site au proxy : Caddy classique → bloc de `Caddyfile.example` (options A/B) puis `systemctl reload caddy` ;
   proxy Coolify (Caddy dans Docker) → section « Serveur avec Coolify » ci-dessous (l'étape 1 est à adapter : `HOST`, `EDGE_SECRET`).
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
  2. SSL/TLS de la zone : « Full » ou « Full (strict) » (pas « Flexible » : boucle de redirections). Ce réglage
     concerne **toute la zone** : vérifiez-le avant de le modifier, vos autres sous-domaines en dépendent.
  3. Serveur, `/etc/etabli/env` : `TRUST_PROXY=cf`, puis `systemctl restart etabli`.
  4. **Protéger l'origine** (voir ci-dessous), puis ajouter le site au proxy.

  **Pourquoi l'étape 4 compte.** ÉTABLI lit l'IP du visiteur dans `CF-Connecting-IP`. Si le serveur répond aussi à
  des connexions directes, cet en-tête est falsifiable : chaque essai de mot de passe peut prétendre venir d'une IP
  différente, et le verrouillage ne se déclenche jamais. Deux façons de ne répondre qu'à Cloudflare :

  - **Secret partagé `EDGE_SECRET` (recommandé, et indispensable derrière Docker/Coolify).** Cloudflare ajoute un
    en-tête secret à chaque requête ; ÉTABLI répond **403** à toute requête qui ne le porte pas (sauf
    `/api/health`, contrôle local sans donnée). Aucune liste d'IP à entretenir, aucun fichier dans le proxy.
    ```
    SECRET=$(openssl rand -hex 32)                                  # 64 caractères hexadécimaux
    echo "EDGE_SECRET=$SECRET" | sudo tee -a /etc/etabli/env >/dev/null && sudo systemctl restart etabli
    echo "$SECRET"                                                  # à coller dans Cloudflare, ne le partagez pas
    ```
    Cloudflare → Rules → Transform Rules → *Modify Request Header* → nouvelle règle : condition « Hostname égal à
    `etabli.example.com` », action « Set static » `X-Etabli-Edge` = le secret. (Disponibilité sur votre formule
    Cloudflare : à vérifier dans le tableau de bord.) Sans cette règle, le site répond 403 à tout le monde.
  - **Plages d'IP de Cloudflare dans Caddy** (Caddy classique installé sur l'hôte uniquement) :
    `sudo /opt/etabli/cloudflare-ips.sh` écrit `/etc/caddy/etabli-cloudflare.caddy` (fragment à `import` dans le bloc
    du site, voir `Caddyfile.example` option B) ; rafraîchir avec
    `0 4 * * 1  root  /opt/etabli/cloudflare-ips.sh && systemctl reload caddy` dans `/etc/cron.d/etabli-cloudflare`.
    **Jamais** dans un dossier importé au niveau global du proxy (Coolify : le script le refuse).

  Certificat d'origine : le proxy demande normalement un certificat Let's Encrypt. Si les autres sites de la zone en
  obtiennent derrière Cloudflare, celui-ci fera de même ; sinon utilisez un **certificat d'origine Cloudflare**
  (SSL/TLS → Origin Server).

## Serveur avec Coolify (Caddy dans Docker)

Sur un serveur géré par Coolify dont le proxy est Caddy (conteneur `coolify-proxy`, image
`lucaslorentz/caddy-docker-proxy`), il n'y a ni `/etc/caddy` ni `systemctl reload caddy`. ÉTABLI reste un service
systemd sur l'hôte ; on l'ajoute comme **un site du proxy**. Attention : la documentation de Coolify qualifie Caddy
d'expérimental et prévient qu'une configuration de proxy invalide peut rendre **tous** les sites du serveur
injoignables. Validez avant d'appliquer, et n'y déposez que le bloc de site ci-dessous.

1. **Repérer l'hôte (lecture seule).**
   ```
   docker exec coolify-proxy grep host.docker.internal /etc/hosts      # IP de la passerelle Docker (ex. 172.17.0.1)
   docker inspect coolify-proxy --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' | grep -i dynamic
   ss -tlnp | grep ':8080'                                              # le port doit être libre
   ```
   Le dossier dynamique est vu comme `/dynamic/` dans le conteneur ; sur l'hôte, c'est la source indiquée par la
   2ᵉ commande (`/data/coolify/proxy/dynamic/` sur le serveur de référence ; la documentation de Coolify mentionne
   `/data/coolify/proxy/caddy/dynamic/` : fiez-vous à `docker inspect`).
2. **Installer** (`install.sh`), puis régler `/etc/etabli/env` :
   ```
   GW=172.17.0.1                                        # l'IP trouvée à l'étape 1
   sudo sed -i "s|^HOST=.*|HOST=$GW|; s|^TRUST_PROXY=.*|TRUST_PROXY=cf|" /etc/etabli/env
   ```
   puis `LEGACY_URL=…` et `EDGE_SECRET` (section précédente), et `sudo systemctl restart etabli`. Dans un conteneur,
   « 127.0.0.1 » désigne le conteneur lui-même : ÉTABLI doit écouter sur l'IP de la passerelle (jamais `0.0.0.0` : le
   port serait ouvert sur Internet). L'unité `etabli.service` démarre après Docker et réessaie sans limite, car cette
   IP n'existe qu'une fois Docker démarré. Contrôle : `curl -fsS http://$GW:8080/api/health`.
3. **Cloudflare** : enregistrement A proxifié et règle « Modify Request Header » (section précédente).
4. **Ajouter le site au proxy**, de préférence depuis le tableau de bord Coolify (*Servers → votre serveur → Proxy →
   Dynamic Configurations*, fichier `etabli.caddy`), qui recharge le proxy lui-même ; sinon déposer le fichier dans le
   dossier dynamique. Contenu **unique** du fichier :
   ```
   etabli.example.com {
   	encode zstd gzip
   	reverse_proxy host.docker.internal:8080
   }
   ```
   (ou l'IP de la passerelle à la place de `host.docker.internal`). Si vous déposez le fichier à la main, validez-le
   aussitôt, et supprimez-le s'il est invalide : `docker exec coolify-proxy caddy adapt --config /dynamic/etabli.caddy
   --adapter caddyfile >/dev/null && echo OK`. Si le proxy ne le prend pas en compte seul, redémarrez-le depuis
   Coolify (coupure de quelques secondes pour tous les sites).
5. **Vérifier** : `curl -sI https://etabli.example.com/` → 200 ; accès direct sans le secret (depuis votre poste :
   `curl -sk --resolve etabli.example.com:443:<IP-du-serveur> https://etabli.example.com/`) → 403
   « Accès direct refusé » ; `curl -i http://$GW:8080/` sur le serveur → 403 également.

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
même message d'erreur pour un identifiant inconnu ou un mot de passe faux ; contrôle d'origine (anti-CSRF) ; secret d'origine
`EDGE_SECRET` (403 pour toute requête qui ne passe pas par Cloudflare) ;
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
cd server && npm test                              # serveur (33 tests, sans réseau)
cd site/devjs && npm run test:unit                 # noyau + couche de stockage (hors ligne)
cd site/devjs && npm run test:ui                   # navigateur : mode local + mode serveur (Playwright)
node --test deploy/test/*.test.js                  # update.sh / backup.sh (faux GitHub local) et cloudflare-ips.sh (Caddy si installé)
```
