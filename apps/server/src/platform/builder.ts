import { ENV_KEY_PATTERN } from '@hangar/shared'
import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CommandError, type LineHandler, run } from './process.ts'

export interface BuildRequest {
  /** Directory holding the source to build (the clone plus the project's root directory). */
  contextDir: string
  /** Scratch directory outside the build context for the plan and secret files. */
  workDir: string
  tag: string
  /** Project env vars. Passed as BuildKit secrets, so they never end up in image layers. */
  secrets: Record<string, string>
  /** Isolates Railpack's cache mounts per project. */
  cacheKey: string
  signal?: AbortSignal
  onLine: LineHandler
  /** Called once the build method is known, before any output. */
  onMethod?: (method: BuildMethod) => void
}

export type BuildMethod = 'dockerfile' | 'railpack'

// `railpack prepare` exits with 75 for transient problems (e.g. a download failed) worth one retry.
const RAILPACK_RETRYABLE_EXIT = 75

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  )
}

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
    // A bare `--env NAME` makes Railpack read the value from its environment and list NAME as a
    // build secret in the plan.
    for (const key of Object.keys(request.secrets)) args.push('--env', key)
    const runOptions = {
      env: request.secrets,
      signal: request.signal,
      onLine: request.onLine,
    }
    let result = await run('railpack', args, runOptions)
    if (result.code === RAILPACK_RETRYABLE_EXIT) result = await run('railpack', args, runOptions)
    if (result.code !== 0) throw new CommandError('railpack prepare', result.code, result.tail)
    return planFile
  }

  return {
    async build(request: BuildRequest): Promise<BuildMethod> {
      const hasDockerfile = await exists(path.join(request.contextDir, 'Dockerfile'))
      const method: BuildMethod = hasDockerfile ? 'dockerfile' : 'railpack'
      request.onMethod?.(method)
      const args = ['buildx', 'build', '--load', '--progress', 'plain', '--tag', request.tag]
      args.push(...(await secretArgs(request)))

      if (method === 'railpack') {
        if (!options.railpackFrontend) {
          throw new Error('HANGAR_RAILPACK_FRONTEND is not set, so Railpack builds are unavailable')
        }
        const planFile = await railpackPlan(request)
        const secretsHash = createHash('sha256')
          .update(
            Object.entries(request.secrets)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => `${key}=${value}`)
              .join('\n'),
          )
          .digest('hex')
        args.push(
          '--build-arg',
          `BUILDKIT_SYNTAX=${options.railpackFrontend}`,
          '--build-arg',
          `secrets-hash=${secretsHash}`,
          '--build-arg',
          `cache-key=${request.cacheKey}`,
          '--file',
          planFile,
        )
      }

      args.push(request.contextDir)
      const result = await run('docker', args, { signal: request.signal, onLine: request.onLine })
      if (result.code !== 0) throw new CommandError('docker buildx build', result.code, result.tail)
      return method
    },
  }
}

export type Builder = ReturnType<typeof createBuilder>
