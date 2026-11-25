import { checkLibraryPath } from '@hangar/shared'
import type { Ctx } from '../context.ts'

// Looking at the computer's own folders (D42). Core never sees them: a throwaway container with no
// network, no capabilities, and the computer's root mounted read-only does the looking, using
// core's own image (already on the computer). Paths reach it as an argument, never as code.

/**
 * Walks the path one folder at a time and refuses any part that is a link, so a library is always
 * the folder its path names (a link could point it at /etc later). Exit codes: 3 a link, 4 not a
 * folder, 0 fine.
 */
const WALK = `
set -f
p="$1"; cur=/host
IFS=/
for part in $p; do
  [ -z "$part" ] && continue
  cur="$cur/$part"
  if [ -L "$cur" ]; then printf '%s' "\${cur#/host}"; exit 3; fi
done
[ -d "$cur" ] || exit 4
exit 0
`

export type FolderCheck = { ok: true } | { ok: false; problem: 'missing' | 'link'; link?: string }

let probeImage: string | null = null

async function image(ctx: Ctx): Promise<string> {
  probeImage ??= await ctx.docker.containerImage(new URL(ctx.config.coreUrl).hostname)
  if (!probeImage) throw new Error('Could not find the hangar-core image to check folders with')
  return probeImage
}

/** Checks a library folder on the computer. Call `checkLibraryPath` first; this assumes it passed. */
export async function checkHostFolder(ctx: Ctx, path: string): Promise<FolderCheck> {
  if (checkLibraryPath(path) !== null) throw new Error(`Unchecked library path: ${path}`)
  const { exitCode, output } = await ctx.docker.runProbe({
    image: await image(ctx),
    cmd: ['sh', '-c', WALK, 'probe', path],
    binds: ['/:/host:ro'],
  })
  if (exitCode === 0) return { ok: true }
  if (exitCode === 3) return { ok: false, problem: 'link', link: output }
  return { ok: false, problem: 'missing' }
}

let gpu: { value: boolean; at: number } | null = null
const GPU_CACHE_MS = 10 * 60_000

/** Whether the computer has a graphics chip apps can use: a render node under /dev/dri. */
export async function hasGpu(ctx: Ctx): Promise<boolean> {
  if (gpu && Date.now() - gpu.at < GPU_CACHE_MS) return gpu.value
  const value = await ctx.docker
    .runProbe({
      image: await image(ctx),
      cmd: ['sh', '-c', 'ls /host/dev/dri/renderD* >/dev/null 2>&1'],
      binds: ['/dev:/host/dev:ro'],
    })
    .then((r) => r.exitCode === 0)
    .catch(() => false)
  gpu = { value, at: Date.now() }
  return value
}

/**
 * Writes a file into a kept folder unless one is already there (D53). Path and content reach the
 * helper as arguments, never as code; it has no network and may only write past file owners.
 */
const WRITE_IF_MISSING = `
set -eu
f="/v/$1"
[ -e "$f" ] && exit 0
mkdir -p "\${f%/*}"
printf '%s' "$2" > "$f"
chmod 644 "$f"
echo written
`

export async function writeFileIfMissing(
  ctx: Ctx,
  volume: string,
  path: string,
  content: string,
): Promise<boolean> {
  const { exitCode, output } = await ctx.docker.runProbe({
    image: await image(ctx),
    cmd: ['sh', '-c', WRITE_IF_MISSING, 'write', path, content],
    binds: [`${volume}:/v`],
    // The app may have made its folders its own (Mosquitto runs as user 1883).
    capAdd: ['DAC_OVERRIDE'],
  })
  if (exitCode !== 0) throw new Error(`Could not write ${path} into ${volume}: ${output}`)
  return output.includes('written')
}
