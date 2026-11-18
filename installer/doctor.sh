#!/usr/bin/env bash
# hangar-doctor: checks the pieces Hangar needs on this machine and says, in plain words, what to
# do about anything wrong. Changes nothing.
set -uo pipefail

HANGAR_DIR="${HANGAR_DIR:-/opt/hangar}"
# shellcheck source=installer/lib.sh
. "$HANGAR_DIR/lib.sh"
require_root
ENV_FILE="$HANGAR_DIR/.env"
problems=0
bad() {
  printf '  %s✗%s %s\n' "$RED" "$RESET" "$1"
  [ -n "${2:-}" ] && printf '    %s\n' "$2"
  problems=$((problems + 1))
}
env_value() { awk -F= "/^$1=/ {print \$2}" "$ENV_FILE" 2>/dev/null; }

step "Preflight inspection" "Checking Docker, Hangar's containers, Tailscale, and the tunnel."

[ -f "$ENV_FILE" ] || { bad "Hangar is not installed in $HANGAR_DIR." "Install it: https://hangar.benduffaut.com/install"; exit 1; }
ok "Hangar $(env_value HANGAR_VERSION) is installed in $HANGAR_DIR"

if docker info >/dev/null 2>&1; then ok "Docker is running"; else
  bad "Docker is not running." "Start it: sudo systemctl start docker"
fi

for name in hangar-db hangar-proxy hangar-core; do
  state=$(docker inspect -f '{{.State.Status}}{{if .State.Health}} {{.State.Health.Status}}{{end}}' "$name" 2>/dev/null)
  case "$state" in
    'running' | 'running healthy') ok "$name is running" ;;
    '') bad "$name does not exist." "Run the installer again: it keeps your data." ;;
    *) bad "$name is $state." "See why: sudo docker logs $name --tail 50" ;;
  esac
done

bind_ip=$(env_value HANGAR_BIND_IP)
ts_name=$(env_value HANGAR_TAILSCALE_HOSTNAME)
if [ -n "$ts_name" ]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    bad "Tailscale is not installed, but Hangar is set to use it." "Run: sudo hangar-tailscale"
  elif ! tailscale status --json --peers=false 2>/dev/null | grep -q '"BackendState": *"Running"'; then
    bad "Tailscale is not connected, so your devices cannot reach the Control Tower." "Run: sudo tailscale up"
  else
    ts_ip=$(tailscale ip -4 2>/dev/null | head -1)
    ok "Tailscale is connected ($ts_ip)"
    if [ "$ts_ip" != "$bind_ip" ]; then
      bad "Hangar listens on $bind_ip, but this machine's Tailscale address is now $ts_ip." "Run: sudo hangar-tailscale"
    fi
  fi
  if [ "$(env_value HANGAR_TAILSCALE_HTTPS)" = 1 ]; then
    if tailscale serve status 2>/dev/null | grep -q "https://$ts_name"; then
      ok "HTTPS is on: https://$ts_name"
    else
      bad "HTTPS for https://$ts_name is not set up in Tailscale." "Run: sudo hangar-tailscale"
    fi
  else
    printf '  %s!%s The Control Tower uses plain HTTP over Tailscale: http://%s\n' "$YELLOW" "$RESET" "$ts_name"
    printf '    For HTTPS, turn on HTTPS Certificates at https://login.tailscale.com/admin/dns, then run: sudo hangar-tailscale\n'
  fi
else
  printf '  %s!%s Hangar was installed without Tailscale: the Control Tower answers on your local network only.\n' "$YELLOW" "$RESET"
  printf '    To reach it from anywhere, run: sudo hangar-tailscale\n'
fi

if ss -ltnH "( sport = :80 )" | awk '{print $4}' | grep -q "^${bind_ip//./\\.}:80$\|^0\.0\.0\.0:80$"; then
  ok "Something listens on $bind_ip:80"
else
  bad "Nothing listens on $bind_ip:80." "Restart the proxy: sudo docker restart hangar-proxy"
fi

if docker ps -q --filter name='^hangar-tunnel$' | grep -q .; then
  ok "The Cloudflare tunnel is running (your public apps)"
else
  printf '  %s-%s No Cloudflare tunnel: apps are not on the internet (optional).\n' "$DIM" "$RESET"
fi

free_kb=$(df -Pk / | awk 'NR==2 {print $4}')
if [ "$free_kb" -lt 2000000 ]; then
  bad "Less than 2 GB of disk is free." "Old images go when you delete projects; also try: sudo docker system prune"
else
  ok "Free disk $((free_kb / 1024 / 1024)) GB"
fi

if [ "$problems" = 0 ]; then
  printf '\n%sAll clear.%s\n' "$GREEN$BOLD" "$RESET"
else
  printf '\n%s%d thing(s) to fix, listed above.%s\n' "$YELLOW$BOLD" "$problems" "$RESET"
  exit 1
fi
