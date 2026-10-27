# Shared helpers for install.sh, update.sh, and uninstall.sh. Each themed line is followed by a
# plain description; errors and warnings are always plain.

HANGAR_DIR="${HANGAR_DIR:-/opt/hangar}"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; TEAL=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; TEAL=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

# step "<themed line>" "<what is actually happening>"
step() {
  printf '\n%s%s%s\n  %s%s%s\n' "$TEAL$BOLD" "$1" "$RESET" "$DIM" "$2" "$RESET"
}

ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1" >&2; }
fail() {
  printf '\n%sError:%s %s\n' "$RED$BOLD" "$RESET" "$1" >&2
  [ -n "${2:-}" ] && printf '%s\n' "$2" >&2
  exit 1
}

require_root() {
  [ "$(id -u)" -eq 0 ] || fail "Run this as root." "Try: sudo bash $0"
}

# Asks a yes/no question; HANGAR_ASSUME_YES=1 answers yes for unattended runs.
confirm() {
  [ "${HANGAR_ASSUME_YES:-0}" = 1 ] && return 0
  [ -t 0 ] || return 1
  local answer
  read -r -p "$1 [y/N] " answer
  [ "$answer" = y ] || [ "$answer" = Y ]
}

compose() {
  docker compose --project-directory "$HANGAR_DIR" -f "$HANGAR_DIR/docker-compose.yml" "$@"
}

# Waits until core answers its health check (through Docker, so no hostname is needed).
wait_for_core() {
  local i
  for i in $(seq 1 90); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' hangar-core 2>/dev/null)" = healthy ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}
