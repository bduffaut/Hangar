#!/usr/bin/env bash
# Installs Hangar on this server. Safe to run again: it keeps existing secrets and data.
#
# By default the Control Tower is private to your Tailscale network (D40): this script installs
# Tailscale, signs the machine in, and makes Hangar listen on its Tailscale address only.
#
# Optional settings (environment variables):
#   HANGAR_IMAGE       core image to run (default: the published image for HANGAR_VERSION)
#   HANGAR_SKIP_PULL=1 the core image is already loaded (e.g. copied over SSH); do not pull it
#   HANGAR_TAILSCALE=0 skip Tailscale: the Control Tower then answers on the local network only
#   HANGAR_TAILSCALE_AUTHKEY, HANGAR_TAILSCALE_NAME  see tailscale.sh
#   HANGAR_BIND_IP     without Tailscale: the address Hangar listens on (default 0.0.0.0, every
#                      network). With Tailscale it is always the Tailscale address.
#   HANGAR_LAN_IP      without Tailscale: the address devices use to reach it (default: detected)
#   HANGAR_ASSUME_YES=1  answer yes to questions (unattended installs)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=installer/lib.sh
. "$SCRIPT_DIR/lib.sh"
# shellcheck source=installer/tailscale.sh
. "$SCRIPT_DIR/tailscale.sh"

# Remember which settings the caller passed, so a re-run changes only those.
GIVEN_VERSION="${HANGAR_VERSION:-}"
GIVEN_IMAGE="${HANGAR_IMAGE:-}"
GIVEN_BIND_IP="${HANGAR_BIND_IP:-}"
GIVEN_LAN_IP="${HANGAR_LAN_IP:-}"
HANGAR_VERSION="${HANGAR_VERSION:-0.3.1}"
HANGAR_IMAGE="${HANGAR_IMAGE:-ghcr.io/bduffaut/hangar-core:$HANGAR_VERSION}"
HANGAR_BIND_IP="${HANGAR_BIND_IP:-0.0.0.0}"
USE_TAILSCALE="${HANGAR_TAILSCALE:-1}"
ENV_FILE="$HANGAR_DIR/.env"

require_root

step "Clearing the runway..." "Checking that this server can run Hangar."
. /etc/os-release
case "$ID:$VERSION_ID" in
  ubuntu:22.04 | ubuntu:24.04 | ubuntu:26.04 | debian:12 | debian:13) ok "$PRETTY_NAME" ;;
  *)
    warn "$PRETTY_NAME is not one of the tested systems (Ubuntu 22.04, 24.04, 26.04, Debian 12, 13)."
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

if [ "$USE_TAILSCALE" = 1 ]; then
  step "Joining your private network..." "Your Control Tower will answer only on your own Tailscale network."
  tailscale_install
  tailscale_sign_in
  HANGAR_BIND_IP=$(tailscale ip -4 | head -1)
fi

if ! docker ps --filter name='^hangar-proxy$' -q 2>/dev/null | grep -q .; then
  # Binding every address conflicts with any listener on port 80; one address, only with a
  # listener on that address or on every address.
  if [ "$HANGAR_BIND_IP" = 0.0.0.0 ]; then
    port80_conflict='.*'
  else
    port80_conflict="(0\.0\.0\.0|\[::\]|\*|${HANGAR_BIND_IP//./\\.})"
  fi
  if ss -ltnH "( sport = :80 )" | awk '{print $4}' | grep -qE "^${port80_conflict}:80$"; then
    fail "Port 80 is already in use on ${HANGAR_BIND_IP}." "Stop whatever uses it, or set HANGAR_BIND_IP to a different address."
  fi
  ok "Port 80 is free on ${HANGAR_BIND_IP}"
fi

step "Rolling open the hangar doors..." "Writing Hangar's files to $HANGAR_DIR."
install -d -m 0755 "$HANGAR_DIR"
# A re-run moves a live install forward, migrations included, so keep a way back.
if [ "$(docker inspect -f '{{.State.Running}}' hangar-db 2>/dev/null)" = true ]; then
  backups="$HANGAR_DIR/backups"
  install -d -m 0700 "$backups"
  backup="$backups/pre-install-$(date +%Y%m%d-%H%M%S).sql.gz"
  docker exec hangar-db pg_dump -U hangar hangar | gzip >"$backup"
  chmod 600 "$backup"
  ok "Database backed up to $backup"
fi
proxy_config_changed=0
if [ -f "$HANGAR_DIR/traefik.yml" ] && ! cmp -s "$SCRIPT_DIR/traefik.yml" "$HANGAR_DIR/traefik.yml"; then
  proxy_config_changed=1
fi
install -m 0644 "$SCRIPT_DIR/docker-compose.yml" "$HANGAR_DIR/docker-compose.yml"
install -m 0644 "$SCRIPT_DIR/traefik.yml" "$HANGAR_DIR/traefik.yml"
install -m 0644 "$SCRIPT_DIR/lib.sh" "$HANGAR_DIR/lib.sh"
install -m 0755 "$SCRIPT_DIR/tailscale.sh" "$HANGAR_DIR/tailscale.sh"

detect_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}'
}

if [ ! -f "$ENV_FILE" ]; then
  if [ "$USE_TAILSCALE" = 1 ]; then
    lan_ip="$HANGAR_BIND_IP"
  else
    lan_ip="${HANGAR_LAN_IP:-$(detect_ip)}"
  fi
  [ -n "$lan_ip" ] || fail "Could not detect this server's address." "Set it explicitly: HANGAR_LAN_IP=192.168.1.50 bash install.sh"
  umask 077
  cat >"$ENV_FILE" <<ENV
# Hangar settings and secrets. Readable by root only; keep a backup somewhere safe.
HANGAR_VERSION=$HANGAR_VERSION
HANGAR_IMAGE=$HANGAR_IMAGE
HANGAR_BIND_IP=$HANGAR_BIND_IP
HANGAR_LAN_IP=$lan_ip
HANGAR_TAILSCALE_HOSTNAME=
HANGAR_TAILSCALE_HTTPS=0
POSTGRES_PASSWORD=$(openssl rand -hex 24)
HANGAR_SESSION_SECRET=$(openssl rand -hex 32)
HANGAR_INSTANCE_KEY=$(openssl rand -base64 32)
ENV
  umask 022
  ok "Generated secrets in $ENV_FILE"
else
  # Keep the secrets and every setting the caller did not pass explicitly.
  [ -n "$GIVEN_VERSION" ] && set_env HANGAR_VERSION "$GIVEN_VERSION"
  [ -n "$GIVEN_IMAGE" ] && set_env HANGAR_IMAGE "$GIVEN_IMAGE"
  [ -z "$GIVEN_IMAGE" ] && [ -n "$GIVEN_VERSION" ] && set_env HANGAR_IMAGE "$HANGAR_IMAGE"
  [ -n "$GIVEN_BIND_IP" ] && set_env HANGAR_BIND_IP "$GIVEN_BIND_IP"
  [ -n "$GIVEN_LAN_IP" ] && set_env HANGAR_LAN_IP "$GIVEN_LAN_IP"
  # Settings of the central site, which no longer exists (D40).
  sed -i '/^HANGAR_CENTRAL_URL=/d; /^HANGAR_PAIRING_CODE=/d' "$ENV_FILE"
  ok "Kept the existing secrets and settings in $ENV_FILE"
fi
if [ "$USE_TAILSCALE" = 1 ]; then
  tailscale_boot_order
  tailscale_configure
elif [ -n "$(awk -F= '/^HANGAR_TAILSCALE_HOSTNAME=/ {print $2}' "$ENV_FILE")" ]; then
  # Asked to leave Tailscale: back to the local network, on every address unless told otherwise.
  if command -v tailscale >/dev/null 2>&1; then
    tailscale serve --https=443 off >/dev/null 2>&1 || true
  fi
  set_env HANGAR_TAILSCALE_HOSTNAME ''
  set_env HANGAR_TAILSCALE_HTTPS 0
  [ -n "$GIVEN_BIND_IP" ] || set_env HANGAR_BIND_IP 0.0.0.0
  if [ -z "$GIVEN_LAN_IP" ]; then
    GIVEN_LAN_IP=$(detect_ip)
    set_env HANGAR_LAN_IP "$GIVEN_LAN_IP"
  fi
  ok "Moved the Control Tower from Tailscale to the local network"
fi
# Use the saved values from here on (a re-run without arguments keeps the old bind address).
HANGAR_IMAGE=$(awk -F= '/^HANGAR_IMAGE=/ {print $2}' "$ENV_FILE")
HANGAR_BIND_IP=$(awk -F= '/^HANGAR_BIND_IP=/ {print $2}' "$ENV_FILE")
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
lan_ip=$(awk -F= '/^HANGAR_LAN_IP=/ {print $2}' "$ENV_FILE")

for network in hangar hangar-apps; do
  docker network inspect "$network" >/dev/null 2>&1 || docker network create "$network" >/dev/null
done
ok "Docker networks hangar (platform) and hangar-apps (your apps)"

step "Starting the engines..." "Downloading images and starting the database, proxy, and Hangar."
if [ "${HANGAR_SKIP_PULL:-0}" = 1 ]; then
  docker image inspect "$HANGAR_IMAGE" >/dev/null 2>&1 || fail "The image $HANGAR_IMAGE is not on this server." "Copy it here first, or run without HANGAR_SKIP_PULL."
  compose pull --quiet hangar-db hangar-proxy
else
  compose pull --quiet
fi
compose up -d --remove-orphans
# Traefik reads this file once, at start, and Compose does not notice a change inside a mount.
if [ "$proxy_config_changed" = 1 ]; then
  compose restart hangar-proxy
fi
wait_for_core || fail "Hangar did not become healthy within 3 minutes." "See what went wrong: docker logs hangar-core"
ok "All systems running"

install -m 0755 "$SCRIPT_DIR/update.sh" /usr/local/bin/hangar-update
install -m 0755 "$SCRIPT_DIR/uninstall.sh" /usr/local/bin/hangar-uninstall
install -m 0755 "$SCRIPT_DIR/doctor.sh" /usr/local/bin/hangar-doctor
ln -sf "$HANGAR_DIR/tailscale.sh" /usr/local/bin/hangar-tailscale
cat >/usr/local/bin/hangar-admin <<'ADMIN'
#!/bin/sh
exec docker exec -i hangar-core hangar-admin "$@"
ADMIN
chmod 0755 /usr/local/bin/hangar-admin
ok "Installed hangar-update, hangar-uninstall, hangar-admin, hangar-tailscale, and hangar-doctor"

# The database owns the address after the first start, so a changed .env alone would not reach
# the running Hangar: apply an explicit or Tailscale address to it too.
if [ -n "$GIVEN_LAN_IP" ] || [ "$USE_TAILSCALE" = 1 ]; then
  docker exec hangar-core hangar-admin set-lan-ip "$lan_ip" >/dev/null 2>&1 \
    && ok "Server address set to $lan_ip" \
    || warn "Could not apply the address $lan_ip. Run: sudo hangar-admin set-lan-ip $lan_ip"
fi

domain="$(echo "$lan_ip" | tr . -).sslip.io"
tower=$(awk -F= '/^HANGAR_TAILSCALE_HOSTNAME=/ {print $2}' "$ENV_FILE")
if [ -n "$tower" ]; then
  scheme=http
  [ "$(awk -F= '/^HANGAR_TAILSCALE_HTTPS=/ {print $2}' "$ENV_FILE")" = 1 ] && scheme=https
  tower="$scheme://$tower"
else
  tower="http://tower.$domain"
fi
code=$(docker exec hangar-core hangar-admin issue-setup-code)

printf '\n%s%sWheels up! Your hangar is ready.%s\n\n' "$GREEN" "$BOLD" "$RESET"
printf '  Control Tower:  %s%s%s\n' "$BOLD" "$tower" "$RESET"
if [ "$USE_TAILSCALE" = 1 ]; then
  printf '  Private to your Tailscale network: open it on any device signed in to the same account.\n\n'
  if command -v qrencode >/dev/null 2>&1 || apt-get install -y -qq qrencode >/dev/null 2>&1; then
    printf '  Or scan this with your phone (Tailscale app on):\n\n'
    qrencode -t ansiutf8 -m 2 "$tower" | sed 's/^/    /'
    printf '\n'
  fi
else
  printf '  Or directly:    http://%s\n\n' "$lan_ip"
fi
if printf '%s' "$code" | grep -q -- '-'; then
  printf '  Open the Control Tower and enter this one-time setup code (the boarding pass):\n\n'
  printf '      %s%s%s\n\n' "$BOLD" "$code" "$RESET"
  printf '  It works once, to create your account. Lost it? Run: sudo hangar-admin issue-setup-code\n\n'
else
  printf '  %s\n\n' "$code"
fi
