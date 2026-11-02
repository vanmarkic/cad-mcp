#!/usr/bin/env bash
# ÉTABLI — installation sur Ubuntu 24.04, à lancer UNE fois en root (idempotent : relançable).
#   curl -fsSL https://raw.githubusercontent.com/vanmarkic/cad-mcp/main/deploy/install.sh -o install.sh
#   less install.sh        # lisez-le avant de l'exécuter
#   sudo bash install.sh
# Ce script N'INSTALLE PAS de serveur web et ne touche à aucune configuration Caddy/nginx existante :
# il affiche à la fin le bloc à ajouter (voir deploy/Caddyfile.example).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/vanmarkic/cad-mcp.git}"
BRANCH="${BRANCH:-main}"
BASE=/opt/etabli
DATA=/var/lib/etabli
CONF=/etc/etabli

[ "$(id -u)" = 0 ] || { echo "à lancer en root (sudo bash install.sh)"; exit 1; }
say() { printf '\n==> %s\n' "$*"; }

say "Paquets (git, curl, sudo)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates sudo

say "Node.js 22 (si absent ou trop ancien)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node --version

say "Utilisateur et dossiers"
id etabli >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin etabli
install -d -o etabli -g etabli -m 755 "$BASE" "$BASE/releases"
install -d -o etabli -g etabli -m 700 "$DATA"
install -d -m 755 "$CONF"
if [ ! -f "$CONF/env" ]; then
  cat > "$CONF/env" <<ENV
PORT=8080
HOST=127.0.0.1
DATA_DIR=$DATA
COOKIE_SECURE=1
# IP réelle du client (limitation des tentatives de connexion) :
#   xff = derrière Caddy seul · cf = derrière Cloudflare (le serveur ne doit alors être joignable QUE par Cloudflare)
TRUST_PROXY=xff
# Ancienne adresse d'ÉTABLI : à la 1re connexion, on propose d'en récupérer les devis (laisser vide sinon)
LEGACY_URL=
SESSION_DAYS=30
# Mises à jour : dépôt et branche suivis (défauts ci-dessous)
#REPO_URL=$REPO_URL
#BRANCH=$BRANCH
ENV
  chmod 644 "$CONF/env"
fi

say "Scripts et services (récupérés depuis $REPO_URL, branche $BRANCH)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git clone --quiet --depth 1 --filter=blob:none --sparse --branch "$BRANCH" "$REPO_URL" "$TMP/r"
git -C "$TMP/r" sparse-checkout set deploy
D="$TMP/r/deploy"
install -m 755 -o root -g root "$D/update.sh" "$BASE/update.sh"
install -m 755 -o root -g root "$D/backup.sh" "$BASE/backup.sh"
install -m 755 "$D/etabli-admin" /usr/local/bin/etabli-admin
for u in etabli.service etabli-update.service etabli-update.timer etabli-backup.service etabli-backup.timer; do
  install -m 644 "$D/$u" "/etc/systemd/system/$u"
done
# l'utilisateur « etabli » peut redémarrer SON service, rien d'autre
echo 'etabli ALL=(root) NOPASSWD: /usr/bin/systemctl restart etabli.service' > /etc/sudoers.d/etabli
chmod 440 /etc/sudoers.d/etabli
visudo -cf /etc/sudoers.d/etabli >/dev/null
systemctl daemon-reload

say "Premier déploiement (clone, tests, mise en service)"
runuser -u etabli -- env BASE_DIR="$BASE" REPO_URL="$REPO_URL" BRANCH="$BRANCH" "$BASE/update.sh"
systemctl enable --now etabli.service etabli-update.timer etabli-backup.timer

say "Terminé"
cat <<NEXT
ÉTABLI écoute sur 127.0.0.1:8080 (non exposé : il faut un reverse proxy HTTPS devant).

Étapes suivantes :
  1. Créer le compte du client :   etabli-admin add <login>      (le mot de passe généré s'affiche une fois)
  2. Ajouter le site à Caddy (voir $BASE/current/deploy/Caddyfile.example), puis : systemctl reload caddy
  3. Renseigner LEGACY_URL dans $CONF/env (ancienne adresse), puis : systemctl restart etabli
  4. Vérifier :   curl -fsS http://127.0.0.1:8080/api/health     ·     journalctl -u etabli -u etabli-update -n 30
Mises à jour : automatiques toutes les 5 minutes (journalctl -u etabli-update).
NEXT
