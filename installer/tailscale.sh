#!/usr/bin/env bash
# Puts the Control Tower on the owner's private Tailscale network (D40). Sourced by install.sh,
# and installed as `hangar-tailscale` to run again on its own: after turning on HTTPS for the
# tailnet, after renaming the machine, or to add Tailscale to an install made without it.
#
# What it does:
#   1. Installs Tailscale if it is missing, and signs this machine in (a link to open, once).
#   2. Makes Hangar listen on this machine's Tailscale address only, so nothing else reaches it.
#   3. Gives the Control Tower HTTPS at https://<machine>.<tailnet>.ts.net with `tailscale serve`
#      when the tailnet allows it; otherwise it answers at http://<machine>.<tailnet>.ts.net.
#   4. Lets Docker publish on the Tailscale address before Tailscale is up at boot.
#
# It never restarts Docker itself, so other containers on this machine keep running.
#
# Settings (environment variables):
#   HANGAR_TAILSCALE_AUTHKEY  sign in with an auth key instead of a link (unattended installs)
#   HANGAR_TAILSCALE_NAME     the machine's name on a new sign-in (default: hangar)

# Reads one field of `tailscale status --json` without needing jq.
ts_status_field() {
  tailscale status --json 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
self = d.get('Self') or {}
value = {'state': d.get('BackendState', ''), 'dns': self.get('DNSName', ''),
         'certs': ' '.join(d.get('CertDomains') or [])}['$1']
print(value.rstrip('.'))
" 2>/dev/null
}

tailscale_install() {
  if command -v tailscale >/dev/null 2>&1; then
    ok "$(tailscale version | head -1 | sed 's/^/Tailscale /')"
    return
  fi
  curl -fsSL https://tailscale.com/install.sh | sh >/dev/null 2>&1 \
    || fail "Could not install Tailscale." "Install it by hand (tailscale.com/download/linux), then run: sudo hangar-tailscale"
  systemctl enable --now tailscaled >/dev/null 2>&1 || true
  ok "Installed Tailscale"
}

tailscale_sign_in() {
  if [ "$(ts_status_field state)" = Running ]; then
    ok "Signed in to Tailscale as $(ts_status_field dns)"
    return
  fi
  local name="${HANGAR_TAILSCALE_NAME:-hangar}"
  if [ -n "${HANGAR_TAILSCALE_AUTHKEY:-}" ]; then
    tailscale up --hostname="$name" --auth-key="$HANGAR_TAILSCALE_AUTHKEY" >/dev/null \
      || fail "Tailscale did not accept that auth key."
  else
    printf '\n  %sSign this machine in to your Tailscale account:%s\n' "$BOLD" "$RESET"
    printf '  Open the link below on any device, sign in, and approve the machine.\n'
    printf '  Use the same Tailscale account as on your phone or laptop.\n\n'
    tailscale up --hostname="$name" --timeout=15m \
      || fail "Tailscale sign-in did not finish." "Run it again when you are ready: sudo hangar-tailscale"
  fi
  ok "Signed in to Tailscale as $(ts_status_field dns)"
}

# Docker publishes Hangar on the Tailscale address; at boot that address may not exist yet.
# Allowing non-local binds lets Docker bind it anyway, and the drop-in starts Docker after
# Tailscale. Both apply from the next boot on; Docker is not restarted now.
tailscale_boot_order() {
  printf 'net.ipv4.ip_nonlocal_bind = 1\n' >/etc/sysctl.d/90-hangar.conf
  sysctl -q -p /etc/sysctl.d/90-hangar.conf >/dev/null 2>&1 || true
  install -d -m 0755 /etc/systemd/system/docker.service.d
  cat >/etc/systemd/system/docker.service.d/hangar-tailscale.conf <<'UNIT'
# Hangar listens on this machine's Tailscale address: start Docker after Tailscale.
[Unit]
After=tailscaled.service
Wants=tailscaled.service
UNIT
  systemctl daemon-reload >/dev/null 2>&1 || true
  ok "Hangar comes back on the Tailscale address after a reboot"
}

# Sets HANGAR_BIND_IP, HANGAR_LAN_IP, HANGAR_TAILSCALE_HOSTNAME and HANGAR_TAILSCALE_HTTPS in
# $ENV_FILE. Prints nothing on success but `ok` lines.
tailscale_configure() {
  local ip dns https=0
  ip=$(tailscale ip -4 2>/dev/null | head -1)
  dns=$(ts_status_field dns)
  [ -n "$ip" ] && [ -n "$dns" ] || fail "Tailscale is running but has no address yet." "Check: tailscale status"

  set_env HANGAR_BIND_IP "$ip"
  set_env HANGAR_LAN_IP "$ip"
  set_env HANGAR_TAILSCALE_HOSTNAME "$dns"

  # HTTPS needs "HTTPS certificates" turned on for the tailnet (one switch in Tailscale's admin).
  if [ -n "$(ts_status_field certs)" ]; then
    if tailscale serve --bg --https=443 "http://$ip:80" >/dev/null 2>&1; then
      https=1
      ok "HTTPS on https://$dns"
    else
      warn "Tailscale could not serve HTTPS. The Control Tower answers on http://$dns for now."
    fi
  else
    warn "HTTPS certificates are off for your tailnet, so the Control Tower uses plain HTTP over Tailscale."
    printf '    Turn them on at https://login.tailscale.com/admin/dns (HTTPS Certificates),\n'
    printf '    then run: sudo hangar-tailscale\n'
  fi
  set_env HANGAR_TAILSCALE_HTTPS "$https"
  TAILSCALE_URL="$([ "$https" = 1 ] && echo https || echo http)://$dns"
  ok "Hangar listens on $ip, your Tailscale address, only"
}

# Adds a KEY=value line to the .env, or replaces it.
set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
  fi
}

# Run on its own (`sudo hangar-tailscale`): set up Tailscale, then restart Hangar on the new
# address.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  # shellcheck source=installer/lib.sh
  . "${HANGAR_DIR:-/opt/hangar}/lib.sh"
  require_root
  ENV_FILE="$HANGAR_DIR/.env"
  [ -f "$ENV_FILE" ] || fail "Hangar is not installed here." "Install it first: see https://hangar.benduffaut.com/install"
  step "Joining your private network..." "Putting the Control Tower on your Tailscale network."
  tailscale_install
  tailscale_sign_in
  tailscale_boot_order
  tailscale_configure
  compose up -d hangar-proxy hangar-core >/dev/null 2>&1
  wait_for_core || fail "Hangar did not come back within 3 minutes." "See what went wrong: docker logs hangar-core"
  printf '\n  Control Tower:  %s%s%s\n\n' "$BOLD" "$TAILSCALE_URL" "$RESET"
fi
