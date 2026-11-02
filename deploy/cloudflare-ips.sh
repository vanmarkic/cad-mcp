#!/usr/bin/env bash
# Génère le fichier Caddy « n'accepter QUE les connexions venant de Cloudflare » pour le site ÉTABLI.
#
# Pourquoi : derrière Cloudflare, ÉTABLI lit l'IP du visiteur dans l'en-tête CF-Connecting-IP (TRUST_PROXY=cf).
# Si le serveur est aussi joignable en direct, n'importe qui peut forger cet en-tête et changer d'IP à chaque
# essai : la limitation des tentatives de connexion est alors contournée. Ici, tout ce qui ne vient pas d'une
# plage Cloudflare reçoit un 403 AVANT d'atteindre ÉTABLI. Restreint à CE site : les autres sites du même
# Caddy et le pare-feu du serveur ne sont pas touchés.
#
# Usage : cloudflare-ips.sh            (écrit /etc/caddy/etabli-cloudflare.caddy)
# Puis dans le Caddyfile, bloc du site :  import /etc/caddy/etabli-cloudflare.caddy   (voir Caddyfile.example)
# Les plages Cloudflare changent rarement : relancez ce script de temps en temps (cron, voir README), puis
# « systemctl reload caddy ». Si la liste devient périmée, des visiteurs légitimes peuvent recevoir un 403.
# Variables : OUT, CF_IPS_V4_URL, CF_IPS_V6_URL, CF_IPS_V4_FILE, CF_IPS_V6_FILE (fichiers locaux, pour les tests)
set -euo pipefail

OUT="${OUT:-/etc/caddy/etabli-cloudflare.caddy}"
V4_URL="${CF_IPS_V4_URL:-https://www.cloudflare.com/ips-v4}"
V6_URL="${CF_IPS_V6_URL:-https://www.cloudflare.com/ips-v6}"

fetch() { # $1 = url, $2 = fichier local facultatif
  if [ -n "${2:-}" ]; then cat "$2"; else curl -fsS -m 20 "$1"; fi
}
# GARDE-FOU : un dossier « dynamic » (Coolify, caddy-docker-proxy…) importe tous ses *.caddy au niveau GLOBAL du
# proxy. Ce fichier-ci est un FRAGMENT de bloc de site (« handle » hors d'un site est invalide) : l'y déposer ferait
# échouer le rechargement et mettrait TOUS les sites du proxy hors ligne. Dans ce cas, utilisez EDGE_SECRET.
case "$OUT" in
  */dynamic/*.caddy|*/dynamic/*.Caddyfile)
    echo "refus : « $OUT » serait importé au niveau global du proxy et casserait tous vos sites." >&2
    echo "Avec Coolify / caddy-docker-proxy, protégez ÉTABLI avec EDGE_SECRET (voir deploy/README.md)." >&2
    exit 2 ;;
esac
v4="$(fetch "$V4_URL" "${CF_IPS_V4_FILE:-}")"
v6="$(fetch "$V6_URL" "${CF_IPS_V6_FILE:-}")"

# Validation stricte : une plage mal formée ou une liste vide ne doit JAMAIS remplacer une bonne liste
# (une liste vide bloquerait tout le monde, une liste falsifiée ouvrirait l'accès).
cidr4='^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$'
cidr6='^[0-9a-fA-F:]+/[0-9]{1,3}$'
ranges=()
while IFS= read -r line; do
  line="${line//[$'\r ']/}"; [ -z "$line" ] && continue
  [[ "$line" =~ $cidr4 ]] || { echo "plage IPv4 invalide : « $line » — fichier inchangé" >&2; exit 1; }
  ranges+=("$line")
done <<<"$v4"
n4=${#ranges[@]}
while IFS= read -r line; do
  line="${line//[$'\r ']/}"; [ -z "$line" ] && continue
  [[ "$line" =~ $cidr6 ]] || { echo "plage IPv6 invalide : « $line » — fichier inchangé" >&2; exit 1; }
  ranges+=("$line")
done <<<"$v6"
[ "$n4" -ge 5 ] && [ "${#ranges[@]}" -gt "$n4" ] || { echo "liste Cloudflare incomplète (${n4} plages IPv4, ${#ranges[@]} au total) — fichier inchangé" >&2; exit 1; }

tmp="$(mktemp "$(dirname "$OUT")/.cf.XXXXXX")"
{
  echo "# Généré par cloudflare-ips.sh le $(date -u +%F) — ne pas modifier à la main."
  echo "@notcf not remote_ip ${ranges[*]}"
  echo "handle @notcf {"
  printf '\trespond "Accès direct refusé" 403\n'
  echo "}"
} >"$tmp"
chmod 644 "$tmp"
if [ -f "$OUT" ] && diff -q <(grep -v '^# Généré' "$OUT") <(grep -v '^# Généré' "$tmp") >/dev/null 2>&1; then
  rm -f "$tmp"; echo "déjà à jour : $OUT (${#ranges[@]} plages)"; exit 0
fi
mv -f "$tmp" "$OUT"
echo "écrit : $OUT (${#ranges[@]} plages). Rechargez Caddy : systemctl reload caddy"
