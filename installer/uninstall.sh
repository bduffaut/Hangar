#!/usr/bin/env bash
# hangar-uninstall: stops and removes Hangar and the apps it runs. Asks separately before
# deleting data, so nothing is lost by accident.
set -euo pipefail

HANGAR_DIR="${HANGAR_DIR:-/opt/hangar}"
# shellcheck source=installer/lib.sh
. "$HANGAR_DIR/lib.sh"
require_root

printf 'This stops Hangar and removes the apps it deployed. Containers that Hangar did not create are not touched.\n'
confirm "Continue?" || fail "Stopped. Nothing was changed."

step "Stopping Hangar" "Removing app containers, the tunnel, and the Hangar stack."
managed=$(docker ps -aq --filter label=hangar.managed=true)
[ -n "$managed" ] && docker rm -f $managed >/dev/null
[ -f "$HANGAR_DIR/docker-compose.yml" ] && compose down --remove-orphans
ok "Stopped"

if confirm "Delete the database (projects, deployments, settings, encrypted environment variables)?"; then
  docker volume rm hangar_hangar-db-data hangar_traefik-dynamic hangar_hangar-builds >/dev/null 2>&1 || true
  ok "Database deleted"
else
  ok "Kept the database volume (hangar_hangar-db-data)"
fi

if confirm "Delete the app images Hangar built (hangar/*)?"; then
  images=$(docker images --filter reference='hangar/*' -q | sort -u)
  [ -n "$images" ] && docker rmi -f $images >/dev/null
  ok "App images deleted"
fi

if confirm "Delete $HANGAR_DIR, including the secrets file and database backups?"; then
  rm -rf "$HANGAR_DIR"
  ok "Deleted $HANGAR_DIR"
fi

docker network rm hangar hangar-apps >/dev/null 2>&1 || true
rm -f /usr/local/bin/hangar-update /usr/local/bin/hangar-uninstall /usr/local/bin/hangar-admin
printf '\nHangar has been removed.\n'
