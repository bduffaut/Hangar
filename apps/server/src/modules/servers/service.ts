// People's own servers (D38): adding one gives a one-time install command; the server pairs with
// it and stays connected. Each server belongs to one account, and only that account sees it.
import { createHash, randomBytes } from 'node:crypto'
import { INSTALL_SCRIPT_PATH, RELEASE_VERSION, type ServerView } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { notFound } from '../../errors.ts'
import type { Hub } from '../../relay/hub.ts'
import {
  deleteServer,
  getServerOf,
  insertServer,
  listServersOf,
  type Server,
  updateServer,
} from './repo.ts'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const PAIRING_TTL_MS = 60 * 60_000

export function serverView(hub: Hub, server: Server): ServerView {
  return {
    id: server.id,
    name: server.name,
    online: hub.isOnline(server.id),
    paired: server.pairedAt !== null,
    lastSeenAt: server.lastSeenAt?.toISOString() ?? null,
    info: (server.info as ServerView['info']) ?? null,
    createdAt: server.createdAt.toISOString(),
  }
}

export async function serverViews(ctx: Ctx, hub: Hub, ownerId: string) {
  return (await listServersOf(ctx.db, ownerId)).map((server) => serverView(hub, server))
}

/** The command a person runs on their server. The code in it works once, for an hour. */
function pairingFor(origin: string) {
  const code = randomBytes(24).toString('base64url')
  const installCommand = `curl -fsSL ${origin}${INSTALL_SCRIPT_PATH} | sudo HANGAR_PAIRING_CODE=${code} bash`
  return { code, installCommand, expiresAt: new Date(Date.now() + PAIRING_TTL_MS) }
}

export async function addServer(ctx: Ctx, hub: Hub, ownerId: string, name: string, origin: string) {
  const pairing = pairingFor(origin)
  const server = await insertServer(ctx.db, {
    ownerId,
    name,
    pairingCodeHash: sha256(pairing.code),
    pairingExpiresAt: pairing.expiresAt,
  })
  return {
    server: serverView(hub, server),
    installCommand: pairing.installCommand,
    expiresAt: pairing.expiresAt.toISOString(),
  }
}

/** A fresh command: for a code that ran out, or to move the server to another machine. */
export async function newPairing(ctx: Ctx, hub: Hub, ownerId: string, id: string, origin: string) {
  const server = await getServerOf(ctx.db, id, ownerId)
  if (!server) throw notFound('Server')
  const pairing = pairingFor(origin)
  await updateServer(ctx.db, id, {
    pairingCodeHash: sha256(pairing.code),
    pairingExpiresAt: pairing.expiresAt,
  })
  return {
    server: serverView(hub, server),
    installCommand: pairing.installCommand,
    expiresAt: pairing.expiresAt.toISOString(),
  }
}

export async function renameServer(ctx: Ctx, hub: Hub, ownerId: string, id: string, name: string) {
  const server = await getServerOf(ctx.db, id, ownerId)
  if (!server) throw notFound('Server')
  await updateServer(ctx.db, id, { name })
  return serverView(hub, { ...server, name })
}

/**
 * Forgets the server here and tells it to stop connecting. Its apps keep running there; they
 * are its own, and `hangar-uninstall` on it removes everything.
 */
export async function removeServer(ctx: Ctx, hub: Hub, ownerId: string, id: string) {
  const server = await getServerOf(ctx.db, id, ownerId)
  if (!server) throw notFound('Server')
  hub.disconnect(id)
  await deleteServer(ctx.db, id)
}

/**
 * The script behind the install command: downloads the published installer, checks its
 * checksum, and runs it connected to this Hangar. The pairing code comes from the environment.
 */
export function installScript(ctx: Ctx, origin: string): string {
  const base = ctx.config.version.split('-')[0]!
  const version = /^\d+\.\d+\.\d+$/.test(base) ? base : RELEASE_VERSION
  const release = `https://github.com/bduffaut/Hangar/releases/download/v${version}`
  return `#!/usr/bin/env bash
# Installs Hangar ${version} on this machine and connects it to ${origin}.
# Your apps build and run here; ${origin} only sends this machine your requests.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run this as root: put sudo in front of bash." >&2; exit 1; fi
if [ -z "\${HANGAR_PAIRING_CODE:-}" ]; then
  echo "Missing the pairing code. Copy the whole command from ${origin} again." >&2
  exit 1
fi
command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
echo "Downloading Hangar ${version}..."
curl -fsSL -o hangar-installer.tar.gz "${release}/hangar-installer.tar.gz"
curl -fsSL -o hangar-installer.tar.gz.sha256 "${release}/hangar-installer.tar.gz.sha256"
sha256sum --check --quiet hangar-installer.tar.gz.sha256
tar -xzf hangar-installer.tar.gz
HANGAR_CENTRAL_URL='${origin}' HANGAR_VERSION='${version}' bash installer/install.sh
`
}
