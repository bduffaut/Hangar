import type { LogStream } from '@hangar/shared'
import type { Ctx } from '../context.ts'
import { appendLogs, type LogLine } from '../modules/deployments/repo.ts'

const FLUSH_INTERVAL_MS = 100
const FLUSH_LINES = 200
const MAX_LINE_LENGTH = 8_000

export type DeploymentLog = ReturnType<typeof createDeploymentLog>

/**
 * Collects build output for one deployment, writes it to deployment_logs in batches, and announces
 * the highest sequence number so live viewers can catch up. Writing logs never fails a deployment.
 */
export function createDeploymentLog(ctx: Ctx, deploymentId: string) {
  let seq = 0
  let buffer: LogLine[] = []
  let timer: NodeJS.Timeout | null = null
  let writing: Promise<void> = Promise.resolve()

  function flush(): Promise<void> {
    if (timer) clearTimeout(timer)
    timer = null
    const lines = buffer
    buffer = []
    if (lines.length === 0) return writing
    writing = writing.then(async () => {
      try {
        await appendLogs(ctx.db, deploymentId, lines)
        await ctx.events.publish('deployment_logs', { deploymentId, seq: lines.at(-1)!.seq })
      } catch (error) {
        ctx.log.warn({ err: error, deploymentId }, 'Could not save build log lines')
      }
    })
    return writing
  }

  function write(stream: LogStream, line: string): void {
    const text = line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line
    buffer.push({ seq: seq++, stream, line: text, ts: new Date() })
    if (buffer.length >= FLUSH_LINES) void flush()
    else timer ??= setTimeout(() => void flush(), FLUSH_INTERVAL_MS)
  }

  return {
    write,
    /** A line written by Hangar itself, as opposed to build output. */
    system: (line: string) => write('system', line),
    flush,
  }
}
