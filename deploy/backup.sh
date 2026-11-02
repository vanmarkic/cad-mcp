#!/usr/bin/env bash
# Sauvegarde locale quotidienne des données ÉTABLI (devis, comptes, clé de session).
# ATTENTION : ce dossier est sur LE MÊME disque que les données. Une vraie sauvegarde exige aussi une
# copie ailleurs (option « Backups » de Hetzner, ou rsync vers un autre serveur / stockage objet).
# Le fichier contient les empreintes des mots de passe et la clé secrète : droits 600, dossier 700.
set -euo pipefail
DATA_DIR="${DATA_DIR:-/var/lib/etabli}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/etabli}"
KEEP="${KEEP:-14}"
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
f="$BACKUP_DIR/etabli-$(date -u +%Y%m%d-%H%M%S).tar.gz"
tar -C "$(dirname "$DATA_DIR")" -czf "$f" "$(basename "$DATA_DIR")"
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/etabli-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "sauvegarde : $f"
