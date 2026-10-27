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
previous_image=$(awk -F= '/^HANGAR_IMAGE=/ {print $2}' "$HANGAR_DIR/.env")
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
# Each release carries its own stack files (compose, proxy config, scripts); use the new ones.
staging=$(mktemp -d)
container=$(docker create "$image")
if docker cp "$container:/app/installer/." "$staging" >/dev/null 2>&1; then
  install -m 0644 "$staging/docker-compose.yml" "$HANGAR_DIR/docker-compose.yml"
  install -m 0644 "$staging/traefik.yml" "$HANGAR_DIR/traefik.yml"
  install -m 0644 "$staging/lib.sh" "$HANGAR_DIR/lib.sh"
  install -m 0755 "$staging/update.sh" /usr/local/bin/hangar-update
  install -m 0755 "$staging/uninstall.sh" /usr/local/bin/hangar-uninstall
  ok "Refreshed the stack files from the new release"
else
  warn "This release does not include stack files; keeping the current ones."
fi
docker rm "$container" >/dev/null
rm -rf "$staging"
for network in hangar hangar-apps; do
  docker network inspect "$network" >/dev/null 2>&1 || docker network create "$network" >/dev/null
done

compose up -d --remove-orphans
if ! wait_for_core; then
  printf '\n%sError:%s Hangar did not become healthy after the update.\n' "$RED$BOLD" "$RESET" >&2
  printf 'See what went wrong: docker logs hangar-core\n' >&2
  db="docker exec hangar-db"
  printf '\nTo go back to the version you had before:\n' >&2
  printf '  1. In %s/.env, set HANGAR_IMAGE=%s\n' "$HANGAR_DIR" "$previous_image" >&2
  printf '  2. %s dropdb -U hangar --force hangar && %s createdb -U hangar hangar\n' "$db" "$db" >&2
  printf '  3. gunzip -c %s/pre-update-%s.sql.gz | docker exec -i hangar-db psql -q -U hangar hangar\n' "$backups" "$stamp" >&2
  printf '  4. docker compose --project-directory %s up -d\n' "$HANGAR_DIR" >&2
  exit 1
fi
ok "Hangar is back up"
printf '\n%sMaintenance complete.%s\n' "$GREEN$BOLD" "$RESET"
