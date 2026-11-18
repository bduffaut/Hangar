#!/usr/bin/env bash
# The one-line install, served at https://hangar.benduffaut.com/install.sh:
#
#   curl -fsSL https://hangar.benduffaut.com/install.sh | sudo bash
#
# Downloads the Hangar release this script names from GitHub, checks its checksum, and runs its
# installer. Set HANGAR_VERSION to install another release. Everything else (HANGAR_TAILSCALE=0,
# ...) passes through to installer/install.sh; see that file.
#
# The whole script is one function, called on the last line, so a download cut short runs nothing.
set -euo pipefail

main() {
  local version="${HANGAR_VERSION:-__HANGAR_VERSION__}"
  local release="https://github.com/bduffaut/Hangar/releases/download/v${version}"

  if [ "$(id -u)" -ne 0 ]; then
    echo "Run this as root: put sudo in front of bash, as in" >&2
    echo "  curl -fsSL https://hangar.benduffaut.com/install.sh | sudo bash" >&2
    exit 1
  fi
  command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl; }

  local work
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  cd "$work"
  echo "Downloading Hangar ${version} from GitHub..."
  curl -fsSL -o hangar-installer.tar.gz "${release}/hangar-installer.tar.gz"
  curl -fsSL -o hangar-installer.tar.gz.sha256 "${release}/hangar-installer.tar.gz.sha256"
  sha256sum --check --quiet hangar-installer.tar.gz.sha256
  tar -xzf hangar-installer.tar.gz

  # Piped into bash, this script's standard input is the script itself; give the installer the
  # terminal, so it can ask questions and show the Tailscale sign-in.
  if [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; then
    HANGAR_VERSION="$version" bash installer/install.sh </dev/tty
  else
    HANGAR_VERSION="$version" bash installer/install.sh
  fi
}

main "$@"
