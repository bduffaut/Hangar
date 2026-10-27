import { spawn } from 'node:child_process'

export type OutputStream = 'stdout' | 'stderr'
export type LineHandler = (stream: OutputStream, line: string) => void

export interface RunOptions {
  cwd?: string
  /**
   * Added to a minimal base environment; Hangar's own secrets are never inherited. Base variables
   * win, so a project env var named PATH cannot break the command.
   */
  env?: Record<string, string>
  signal?: AbortSignal
  onLine?: LineHandler
}

export interface RunResult {
  code: number
  /** The last lines of combined output, for error messages. */
  tail: string[]
  stdout: string
}

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly code: number | null,
    readonly tail: string[],
  ) {
    const output = tail.length > 0 ? `:\n${tail.join('\n')}` : ''
    super(`${command} exited with code ${code ?? 'unknown'}${output}`)
  }
}

const TAIL_LINES = 20
const KILL_GRACE_MS = 10_000
// Variables a child needs to find binaries, its home, and the Docker daemon. Nothing else leaks in.
const INHERITED_ENV = ['PATH', 'HOME', 'LANG', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONFIG']

export function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of INHERITED_ENV) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

/**
 * Runs a command with an argument array (never a shell). Resolves with the exit code; rejects
 * only if the command could not start or was aborted. Output is split into lines as it arrives.
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(options.signal.reason)

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...options.env, ...baseEnv() },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const tail: string[] = []
    let stdout = ''

    const lineReader = (stream: OutputStream) => {
      let pending = ''
      return (chunk: Buffer) => {
        const text = pending + chunk.toString('utf8')
        if (stream === 'stdout') stdout += chunk.toString('utf8')
        const lines = text.split(/\r?\n/)
        pending = lines.pop() ?? ''
        for (const line of lines) emit(stream, line)
      }
    }
    const emit = (stream: OutputStream, line: string) => {
      tail.push(line)
      if (tail.length > TAIL_LINES) tail.shift()
      options.onLine?.(stream, line)
    }
    child.stdout.on('data', lineReader('stdout'))
    child.stderr.on('data', lineReader('stderr'))

    let killTimer: NodeJS.Timeout | undefined
    const onAbort = () => {
      // SIGINT lets buildx cancel the build cleanly; SIGKILL if it does not exit in time.
      child.kill('SIGINT')
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    child.once('error', (error) => {
      options.signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(killTimer)
      options.signal?.removeEventListener('abort', onAbort)
      if (options.signal?.aborted) return reject(options.signal.reason)
      resolve({ code: code ?? -1, tail, stdout })
    })
  })
}

/** Like `run`, but rejects with a CommandError on a non-zero exit. */
export async function runChecked(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run(command, args, options)
  if (result.code !== 0)
    throw new CommandError([command, args[0]].join(' '), result.code, result.tail)
  return result
}
