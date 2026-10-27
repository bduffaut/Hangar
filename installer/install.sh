#!/usr/bin/env bash
# Installs Hangar on this server. Safe to run again: it keeps existing secrets and data.
#
# Optional settings (environment variables):
#   HANGAR_IMAGE       core image to run (default: the published image for HANGAR_VERSION)
#   HANGAR_SKIP_PULL=1 the core image is already loaded (e.g. copied over SSH); do not pull it
#   HANGAR_BIND_IP     the address Hangar listens on (default 0.0.0.0, every network)
#   HANGAR_LAN_IP      the address devices use to reach it (default: detected)
#   HANGAR_ASSUME_YES=1  answer yes to questions (unattended installs)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=installer/lib.sh
. "$SCRIPT_DIR/lib.sh"

HANGAR_VERSION="${HANGAR_VERSION:-0.1.0}"
HANGAR_IMAGE="${HANGAR_IMAGE:-ghcr.io/bduffaut/hangar-core:$HANGAR_VERSION}"
HANGAR_BIND_IP="${HANGAR_BIND_IP:-0.0.0.0}"

require_root

step "Clearing the runway..." "Checking that this server can run Hangar."
. /etc/os-release
case "$ID:$VERSION_ID" in
  ubuntu:22.04 | ubuntu:24.04 | debian:12) ok "$PRETTY_NAME" ;;
  *)
    warn "$PRETTY_NAME is not one of the tested systems (Ubuntu 22.04, 24.04, Debian 12)."
    confirm "Continue anyway?" || fail "Stopped. Nothing was changed."
    ;;
esac
case "$(uname -m)" in
  x86_64 | aarch64) ok "Architecture $(uname -m)" ;;
  *) fail "Hangar runs on 64-bit Intel/AMD (amd64) or ARM (arm64) only. This is $(uname -m)." ;;
esac
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
[ "$mem_kb" -ge 1900000 ] || fail "Hangar needs at least 2 GB of memory; this server has $((mem_kb / 1024)) MB."
ok "Memory $((mem_kb / 1024 / 1024)) GB"
disk_kb=$(df -Pk / | awk 'NR==2 {print $4}')
[ "$disk_kb" -ge 10000000 ] || fail "Hangar needs at least 10 GB of free disk; this server has $((disk_kb / 1024 / 1024)) GB."
ok "Free disk $((disk_kb / 1024 / 1024)) GB"
if ! docker ps --filter name='^hangar-proxy$' -q 2>/dev/null | grep -q .; then
  if ss -ltnH "( sport = :80 )" | awk '{print $4}' | grep -qE "^(0\.0\.0\.0|\[::\]|\*|${HANGAR_BIND_IP//./\\.}):80$"; then
    fail "Port 80 is already in use on ${HANGAR_BIND_IP}." "Stop whatever uses it, or set HANGAR_BIND_IP to a different address."
  fi
fi
ok "Port 80 is free on ${HANGAR_BIND_IP}"

step "Fueling up Docker..." "Making sure Docker Engine and the Compose plugin are installed."
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null
fi
ok "$(docker --version)"
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing." "Install it: apt-get install docker-compose-plugin"
if docker info --format '{{json .DriverStatus}}' | grep -q io.containerd.snapshotter; then
  ok "Docker uses the containerd image store"
else
  warn "Docker's containerd image store is off, so repositories without a Dockerfile cannot be built."
  warn "To turn it on: add \"features\": {\"containerd-snapshotter\": true} to /etc/docker/daemon.json and restart Docker."
fi

step "Rolling open the hangar doors..." "Writing Hangar's files to $HANGAR_DIR."
install -d -m 0755 "$HANGAR_DIR"
install -m 0644 "$SCRIPT_DIR/docker-compose.yml" "$HANGAR_DIR/docker-compose.yml"
install -m 0644 "$SCRIPT_DIR/traefik.yml" "$HANGAR_DIR/traefik.yml"
install -m 0644 "$SCRIPT_DIR/lib.sh" "$HANGAR_DIR/lib.sh"

detect_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}'
}

ENV_FILE="$HANGAR_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  lan_ip="${HANGAR_LAN_IP:-$(detect_ip)}"
  [ -n "$lan_ip" ] || fail "Could not detect this server's address." "Set it explicitly: HANGAR_LAN_IP=192.168.1.50 bash install.sh"
  umask 077
  cat >"$ENV_FILE" <<ENV
# Hangar settings and secrets. Readable by root only; keep a backup somewhere safe.
HANGAR_VERSION=$HANGAR_VERSION
HANGAR_IMAGE=$HANGAR_IMAGE
HANGAR_BIND_IP=$HANGAR_BIND_IP
HANGAR_LAN_IP=$lan_ip
POSTGRES_PASSWORD=$(openssl rand -hex 24)
HANGAR_SESSION_SECRET=$(openssl rand -hex 32)
HANGAR_INSTANCE_KEY=$(openssl rand -base64 32)
ENV
  umask 022
  ok "Generated secrets in $ENV_FILE"
else
  # Keep the secrets; update only the image and bind address if they were given.
  sed -i "s|^HANGAR_IMAGE=.*|HANGAR_IMAGE=$HANGAR_IMAGE|; s|^HANGAR_BIND_IP=.*|HANGAR_BIND_IP=$HANGAR_BIND_IP|" "$ENV_FILE"
  ok "Kept the existing settings in $ENV_FILE"
fi
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
lan_ip=$(awk -F= '/^HANGAR_LAN_IP=/ {print $2}' "$ENV_FILE")

docker network inspect hangar >/dev/null 2>&1 || docker network create hangar >/dev/null
ok "Docker network hangar"

step "Starting the engines..." "Downloading images and starting the database, proxy, and Hangar."
if [ "${HANGAR_SKIP_PULL:-0}" = 1 ]; then
  docker image inspect "$HANGAR_IMAGE" >/dev/null 2>&1 || fail "The image $HANGAR_IMAGE is not on this server." "Copy it here first, or run without HANGAR_SKIP_PULL."
  compose pull --quiet hangar-db hangar-proxy
else
  compose pull --quiet
fi
compose up -d --remove-orphans
wait_for_core || fail "Hangar did not become healthy within 3 minutes." "See what went wrong: docker logs hangar-core"
ok "All systems running"

install -m 0755 "$SCRIPT_DIR/update.sh" /usr/local/bin/hangar-update
install -m 0755 "$SCRIPT_DIR/uninstall.sh" /usr/local/bin/hangar-uninstall
cat >/usr/local/bin/hangar-admin <<'ADMIN'
#!/bin/sh
exec docker exec -i hangar-core hangar-admin "$@"
ADMIN
chmod 0755 /usr/local/bin/hangar-admin
ok "Installed hangar-update, hangar-uninstall, and hangar-admin"

domain="$(echo "$lan_ip" | tr . -).sslip.io"
code=$(docker exec hangar-core hangar-admin issue-setup-code)

printf '\n%s%sWheels up! Your hangar is ready.%s\n\n' "$GREEN" "$BOLD" "$RESET"
printf '  Control Tower:  %shttp://tower.%s%s\n' "$BOLD" "$domain" "$RESET"
printf '  Or directly:    http://%s\n\n' "$lan_ip"
if printf '%s' "$code" | grep -q -- '-'; then
  printf '  Open the Control Tower and enter this one-time setup code (the boarding pass):\n\n'
  printf '      %s%s%s\n\n' "$BOLD" "$code" "$RESET"
  printf '  It works once, to create your account. Lost it? Run: sudo hangar-admin issue-setup-code\n\n'
else
  printf '  %s\n\n' "$code"
fi
