import type { MetricsSample } from '@hangar/shared'
import type { Ctx } from '../../context.ts'

const INTERVAL_MS = 5_000
const HISTORY = (15 * 60_000) / INTERVAL_MS

type Listener = (sample: MetricsSample) => void

/**
 * Samples host and container metrics every 5 s, but only while someone is watching. Keeps the last
 * 15 minutes in memory for sparklines.
 */
export function createMetricsSampler(ctx: Ctx) {
  const history: MetricsSample[] = []
  const listeners = new Set<Listener>()
  let timer: NodeJS.Timeout | null = null

  async function sample(): Promise<void> {
    const [host, apps] = await Promise.all([ctx.hostMetrics.sample(), ctx.docker.listManagedApps()])
    const running = apps.filter((app) => app.running && app.projectId)
    const stats = await Promise.all(running.map((app) => ctx.docker.containerStats(app.id)))
    const containers = running.flatMap((app, i) =>
      stats[i] ? [{ projectId: app.projectId!, ...stats[i] }] : [],
    )
    const entry = { ts: new Date().toISOString(), host, containers }
    history.push(entry)
    if (history.length > HISTORY) history.shift()
    for (const listener of listeners) listener(entry)
  }

  // Each sampling loop has a generation; stopping bumps it, so a sample still in flight from an
  // old loop never reschedules itself alongside a new one.
  let generation = 0
  let looping = false

  const run = (loop: number) => {
    sample()
      .catch((error: unknown) => ctx.log.warn({ err: error }, 'Could not sample metrics'))
      .finally(() => {
        if (loop !== generation) return
        if (listeners.size > 0) timer = setTimeout(() => run(loop), INTERVAL_MS)
        else looping = false
      })
  }

  return {
    history: () => [...history],
    /** Returns a function that stops listening. Sampling stops when nobody listens. */
    subscribe(listener: Listener): () => void {
      listeners.add(listener)
      if (!looping) {
        looping = true
        run(++generation)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && looping) {
          if (timer) clearTimeout(timer)
          timer = null
          looping = false
          generation++
        }
      }
    },
  }
}
