import { ENV_KEY_PATTERN } from '@hangar/shared'
import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CommandError, type LineHandler, run, runChecked } from './process.ts'
import { findEscapingSymlink } from './symlinks.ts'

export interface BuildRequest {
  /** Directory holding the source to build (the clone plus the project's root directory). */
  contextDir: string
  /** The whole checkout. Symlinks in the build context must not point outside it. */
  repoDir: string
  /** Scratch directory outside the build context for the plan and secret files. */
  workDir: string
  tag: string
  /** Project env vars. Passed as BuildKit secrets, so they never end up in image layers. */
  secrets: Record<string, string>
  /** Isolates Railpack's cache mounts per project. */
  cacheKey: string
  /** The account's own builder, from `ensureBuilder`. */
  builderName: string
  /**
   * Build without BuildKit's cache. Secret mounts do not invalidate cached steps, so a Dockerfile
   * build must skip the cache when the secrets changed. (Railpack builds use `secrets-hash`.)
   */
  noCache?: boolean
  signal?: AbortSignal
  onLine: LineHandler
  /** Called once the build method is known, before any output. */
  onMethod?: (method: BuildMethod) => void
}

export type BuildMethod = 'dockerfile' | 'railpack'

// `railpack prepare` exits with 75 for transient problems (e.g. a download failed) worth one retry.
const RAILPACK_RETRYABLE_EXIT = 75

// Pinned by digest; upgrade deliberately.
const BUILDKIT_IMAGE =
  'moby/buildkit:v0.26.3@sha256:5601811fde88bb9e8a577bfe804af82bccb712e1cd07ff94663bded5e628cf75'

/**
 * Env vars that change how a program runs rather than what it does. Railpack runs inside core,
 * next to the Docker socket, so a project must not steer it or the tools it starts. They still
 * reach the app and its build steps, which run in containers.
 */
const TOOL_CONTROL_ENV =
  /^(LD_|DYLD_|GIT_|MISE_|DOCKER_|BUILDKIT_|BUILDX_|SSL_|CURL_|HTTPS?_PROXY$)/i

/** The env vars that are safe to hand to the Railpack CLI. */
export function railpackEnv(secrets: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(secrets).filter(([key]) => !TOOL_CONTROL_ENV.test(key)))
}

/** A fingerprint of a build's env vars (names and values), never stored alongside them. */
export function secretsHash(secrets: Record<string, string>): string {
  return createHash('sha256')
    .update(
      Object.entries(secrets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    )
    .digest('hex')
}

async function hasDockerfile(contextDir: string): Promise<boolean> {
  // Escaping links were rejected already, so following a link here stays inside the repository.
  const stats = await stat(path.join(contextDir, 'Dockerfile')).catch(() => null)
  return stats?.isFile() ?? false
}

/**
 * Each account builds on its own BuildKit container, on its own network, instead of the Docker
 * daemon's built-in builder. The built-in one shares its cache between all accounts (a build could
 * reuse, or plant, layers of another account's image) and fetches `ADD http://…` from the host.
 */
export function createBuilder(options: { railpackFrontend: string | null }) {
  /** Writes each secret to its own file so values never pass through argv or the CLI's env. */
  async function secretArgs(request: BuildRequest): Promise<string[]> {
    const dir = path.join(request.workDir, 'secrets')
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const args: string[] = []
    for (const [key, value] of Object.entries(request.secrets)) {
      if (!ENV_KEY_PATTERN.test(key)) throw new Error(`Invalid env var name: ${key}`)
      const file = path.join(dir, key)
      await writeFile(file, value, { mode: 0o600 })
      args.push('--secret', `id=${key},src=${file}`)
    }
    return args
  }

  async function railpackPlan(request: BuildRequest): Promise<string> {
    const planFile = path.join(request.workDir, 'railpack-plan.json')
    const args = ['prepare', request.contextDir, '--plan-out', planFile]
    const env = railpackEnv(request.secrets)
    // A bare `--env NAME` makes Railpack read the value from its environment and list NAME as a
    // build secret in the plan.
    for (const key of Object.keys(env)) args.push('--env', key)
    const runOptions = {
      env,
      signal: request.signal,
      onLine: request.onLine,
    }
    let result = await run('railpack', args, runOptions)
    if (result.code === RAILPACK_RETRYABLE_EXIT) result = await run('railpack', args, runOptions)
    if (result.code !== 0) throw new CommandError('railpack prepare', result.code, result.tail)
    return planFile
  }

  return {
    async build(request: BuildRequest): Promise<void> {
      // The whole checkout, not just the context: an in-repo link can lead to another link.
      const escaping = await findEscapingSymlink(request.repoDir, request.repoDir)
      if (escaping) {
        throw new Error(
          `"${escaping}" is a symlink to a file outside the repository, which Hangar does not ` +
            'allow because build tools would read files from the server. Replace it with a copy ' +
            'of the file or a link to a file inside the repository.',
        )
      }
      const method: BuildMethod = (await hasDockerfile(request.contextDir))
        ? 'dockerfile'
        : 'railpack'
      request.onMethod?.(method)
      const args = ['buildx', 'build', '--builder', request.builderName]
      args.push('--load', '--provenance=false', '--progress', 'plain', '--tag', request.tag)
      args.push(...(await secretArgs(request)))
      if (request.noCache && method === 'dockerfile') args.push('--no-cache')

      if (method === 'railpack') {
        if (!options.railpackFrontend) {
          throw new Error('HANGAR_RAILPACK_FRONTEND is not set, so Railpack builds are unavailable')
        }
        const planFile = await railpackPlan(request)
        args.push(
          '--build-arg',
          `BUILDKIT_SYNTAX=${options.railpackFrontend}`,
          '--build-arg',
          `secrets-hash=${secretsHash(request.secrets)}`,
          '--build-arg',
          `cache-key=${request.cacheKey}`,
          '--file',
          planFile,
        )
      }

      args.push(request.contextDir)
      const result = await run('docker', args, { signal: request.signal, onLine: request.onLine })
      if (result.code !== 0) throw new CommandError('docker buildx build', result.code, result.tail)
    },

    /** Creates the builder if needed. Its record lives in core, so an update may have lost it. */
    async ensureBuilder(name: string, network: string): Promise<void> {
      const known = await run('docker', ['buildx', 'inspect', name])
      if (known.code === 0) return
      await runChecked('docker', [
        'buildx',
        'create',
        '--name',
        name,
        '--driver',
        'docker-container',
        '--driver-opt',
        `network=${network}`,
        '--driver-opt',
        `image=${BUILDKIT_IMAGE}`,
      ])
    },

    /** Removes an account's builder with its cache. A missing builder is fine. */
    async removeBuilder(name: string): Promise<void> {
      await run('docker', ['buildx', 'rm', '--force', name])
    },

    /**
     * Trims one builder's cache: entries unused for `unusedFor`, then the oldest until the total
     * fits in `maxBytes`. Without this, cache from every build grows forever.
     */
    async pruneCache(
      name: string,
      options: { unusedForHours: number; maxBytes: number },
    ): Promise<void> {
      const prune = ['buildx', 'prune', '--builder', name, '--force']
      await runChecked('docker', [...prune, '--filter', `until=${options.unusedForHours}h`])
      await runChecked('docker', [...prune, '--max-used-space', String(options.maxBytes)])
    },
  }
}

export type Builder = ReturnType<typeof createBuilder>
