#!/usr/bin/env bash
# One-time setup of the Hangar development toolchain inside WSL (Ubuntu). Safe to re-run.
# Installs fnm (Node version manager), Node 24, and pnpm, then installs the repo's dependencies.
set -euo pipefail

FNM_DIR="$HOME/.local/share/fnm"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if [ ! -x "$FNM_DIR/fnm" ]; then
  echo "Installing fnm..."
  case "$(uname -m)" in
    x86_64) asset=fnm-linux.zip ;;
    aarch64) asset=fnm-arm64.zip ;;
    *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/fnm.zip" "https://github.com/Schniz/fnm/releases/latest/download/$asset"
  # python3 instead of unzip, which a fresh Ubuntu does not have
  mkdir -p "$FNM_DIR"
  python3 -m zipfile -e "$tmp/fnm.zip" "$FNM_DIR"
  chmod +x "$FNM_DIR/fnm"
  rm -rf "$tmp"
fi

if ! grep -q 'fnm env' "$HOME/.bashrc"; then
  echo "Adding fnm to ~/.bashrc..."
  cat >> "$HOME/.bashrc" <<'EOF'

# fnm (Node version manager)
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env --use-on-cd --shell bash)"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
EOF
fi

export PATH="$FNM_DIR:$PATH"
eval "$(fnm env --shell bash)"
fnm install 24
fnm default 24
corepack enable

cd "$(dirname "$0")/.."
# Re-links node_modules against this machine's pnpm store if it was installed elsewhere first.
pnpm install --config.confirm-modules-purge=false

echo
echo "Setup complete. Open a new terminal (or run: source ~/.bashrc), then:"
echo "  cd ~/code/hangar && pnpm dev"
