#!/usr/bin/env bash
# hangar-update: backs up the database, pulls the newest images, and restarts the stack. Your
# apps, settings, and data are kept; database migrations run when Hangar starts.
#   HANGAR_VERSION=x.y.z  move to that release (default: pull the current image again)
#   HANGAR_SKIP_PULL=1    use the core image already on this server (e.g. copied over SSH)
set -euo pipefail

HANGAR_DIR="${HANGAR_DIR:-/opt/hangar}"
# shellcheck source=installer/lib.sh
. "$HANGAR_DIR/lib.sh"
require_root
[ -f "$HANGAR_DIR/.env" ] || fail "Hangar is not installed in $HANGAR_DIR."

step "Running maintenance..." "Saving a backup of the database first."
backups="$HANGAR_DIR/backups"
install -d -m 0700 "$backups"
stamp=$(date +%Y%m%d-%H%M%S)
docker exec hangar-db pg_dump -U hangar hangar | gzip >"$backups/pre-update-$stamp.sql.gz"
chmod 600 "$backups/pre-update-$stamp.sql.gz"
# Keep the three newest backups.
ls -1t "$backups"/pre-update-*.sql.gz 2>/dev/null | tail -n +4 | xargs -r rm -f
ok "Backup saved to $backups/pre-update-$stamp.sql.gz"

step "Refueling..." "Downloading the newest images and restarting Hangar."
if [ -n "${HANGAR_VERSION:-}" ]; then
  sed -i "s|^HANGAR_VERSION=.*|HANGAR_VERSION=$HANGAR_VERSION|; s|^HANGAR_IMAGE=.*|HANGAR_IMAGE=ghcr.io/bduffaut/hangar-core:$HANGAR_VERSION|" "$HANGAR_DIR/.env"
fi
image=$(awk -F= '/^HANGAR_IMAGE=/ {print $2}' "$HANGAR_DIR/.env")
# An image without a registry path (installed with `pnpm ship`) exists only on this server.
case "$image" in */*) ;; *) HANGAR_SKIP_PULL=1 ;; esac
if [ "${HANGAR_SKIP_PULL:-0}" = 1 ]; then
  compose pull --quiet hangar-db hangar-proxy
else
  compose pull --quiet
fi
compose up -d --remove-orphans
wait_for_core || fail "Hangar did not become healthy after the update." "See what went wrong: docker logs hangar-core. Your backup is in $backups."
ok "Hangar is back up"
printf '\n%sMaintenance complete.%s\n' "$GREEN$BOLD" "$RESET"
