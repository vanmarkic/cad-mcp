#!/usr/bin/env bash
# ÉTABLI — mise à jour par TIRAGE (pull) : le serveur interroge GitHub (dépôt public, aucune clé
# nécessaire) et déploie s'il y a du nouveau. Lancé toutes les 5 minutes par etabli-update.timer.
#
#   1. récupère le dernier commit de la branche (clone partiel + « sparse checkout » : seuls
#      server/, site/devjs/ et deploy/ sont téléchargés — moins de 1 Mo, pas les 500 Mo du dépôt) ;
#   2. s'il est déjà déployé, ou déjà jugé mauvais : ne fait rien (silencieux) ;
#   3. copie la version dans releases/<sha> et y lance les tests unitaires ;
#   4. tests verts → bascule atomique du lien « current », redémarrage, contrôle de santé ;
#      tests rouges ou service qui ne démarre pas → on garde (ou rétablit) la version précédente
#      et on note le commit comme mauvais (pas de nouvel essai tant qu'un nouveau commit n'arrive pas).
#
# Variables (toutes facultatives) : REPO_URL BRANCH BASE_DIR RESTART_CMD HEALTH_URL HEALTH_TRIES
#                                   KEEP TEST_CMD
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/vanmarkic/cad-mcp.git}"
BRANCH="${BRANCH:-main}"
BASE_DIR="${BASE_DIR:-/opt/etabli}"
RESTART_CMD="${RESTART_CMD:-sudo -n /usr/bin/systemctl restart etabli.service}"
HEALTH_URL="${HEALTH_URL-http://127.0.0.1:8080/api/health}"   # vide = pas de contrôle
HEALTH_TRIES="${HEALTH_TRIES:-10}"
KEEP="${KEEP:-3}"
TEST_CMD="${TEST_CMD:-node --test server/test/*.test.js site/devjs/test/core.test.js site/devjs/test/store.test.js}"
SPARSE_PATHS="server site/devjs deploy"

log() { printf '%s [etabli-update] %s\n' "$(date -u +%FT%TZ)" "$*"; }

mkdir -p "$BASE_DIR/releases" "$BASE_DIR/bad"
exec 9>"$BASE_DIR/.update.lock"
flock -n 9 || { log "une mise à jour est déjà en cours"; exit 0; }

REPO="$BASE_DIR/repo"
if [ ! -d "$REPO/.git" ]; then
  log "premier clonage (partiel, sans historique)"
  rm -rf "$REPO"
  git clone --quiet --depth 1 --filter=blob:none --sparse --no-checkout --branch "$BRANCH" "$REPO_URL" "$REPO"
  git -C "$REPO" sparse-checkout init --cone
  # shellcheck disable=SC2086
  git -C "$REPO" sparse-checkout set $SPARSE_PATHS
fi
git -C "$REPO" fetch --quiet --depth 1 origin "$BRANCH"
NEW="$(git -C "$REPO" rev-parse FETCH_HEAD)"

CUR=""
if [ -L "$BASE_DIR/current" ]; then CUR="$(basename "$(readlink -f "$BASE_DIR/current")")"; fi
[ "$NEW" = "$CUR" ] && exit 0
[ -e "$BASE_DIR/bad/$NEW" ] && exit 0

log "nouvelle version $NEW (actuelle : ${CUR:-aucune})"
git -C "$REPO" checkout --quiet --force --detach "$NEW"

TMP="$BASE_DIR/releases/.tmp-$NEW"
rm -rf "$TMP"; mkdir -p "$TMP"
mark_bad() { touch "$BASE_DIR/bad/$NEW"; [ -f "$TMP.log" ] && mv -f "$TMP.log" "$BASE_DIR/bad/$NEW.log" || true; rm -rf "$TMP"; }
for d in $SPARSE_PATHS; do
  if [ ! -d "$REPO/$d" ]; then log "dossier « $d » absent de cette version : ignorée"; mark_bad; exit 1; fi
done
# shellcheck disable=SC2086
tar -C "$REPO" -cf - $SPARSE_PATHS | tar -C "$TMP" -xf -

if ! ( cd "$TMP" && bash -c "$TEST_CMD" ) >"$TMP.log" 2>&1; then
  log "tests EN ÉCHEC : version ignorée, l'actuelle reste en service (détail : $BASE_DIR/bad/$NEW.log)"
  mark_bad
  exit 1
fi
rm -f "$TMP.log"

mv "$TMP" "$BASE_DIR/releases/$NEW"
PREV="$CUR"
switch_to() { ln -sfn "$BASE_DIR/releases/$1" "$BASE_DIR/current.new" && mv -T "$BASE_DIR/current.new" "$BASE_DIR/current"; }
healthy() {
  [ -z "$HEALTH_URL" ] && return 0
  local i; for i in $(seq 1 "$HEALTH_TRIES"); do curl -fsS -m 3 "$HEALTH_URL" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

switch_to "$NEW"
log "bascule vers $NEW, redémarrage"
if bash -c "$RESTART_CMD" && healthy; then
  log "version $NEW en service"
else
  touch "$BASE_DIR/bad/$NEW"
  if [ -n "$PREV" ] && [ -d "$BASE_DIR/releases/$PREV" ]; then
    log "le service ne répond pas : RETOUR ARRIÈRE vers $PREV"
    switch_to "$PREV"
    bash -c "$RESTART_CMD" || true
  else
    log "le service ne répond pas et aucune version précédente à rétablir"
  fi
  exit 1
fi

# ne garde que les KEEP versions les plus récentes (jamais la courante ni la précédente)
# shellcheck disable=SC2012
ls -1dt "$BASE_DIR"/releases/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r d; do
  d="${d%/}"; b="$(basename "$d")"
  [ "$b" = "$NEW" ] || [ "$b" = "$PREV" ] || rm -rf "$d"
done
