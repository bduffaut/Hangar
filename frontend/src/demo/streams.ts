import type { Stream, StreamOptions } from '../api/streams.ts'
import {
  activeDeployments,
  demoDeployment,
  demoLog,
  demoRuntimeLine,
  demoSample,
  isRunning,
  liveLogLines,
  onDeployment,
  startSimulation,
} from './data.ts'

type Handlers = Record<string, (data: never) => void>

/** The tour's stand-in for a server-sent event stream, chosen by the stream's path. */
export function demoStream(url: string, handlers: Handlers, options: StreamOptions = {}): Stream {
  startSimulation()
  const send = (event: string, data: unknown) => handlers[event]?.(data as never)
  const timers: ReturnType<typeof setTimeout>[] = []
  const every = (ms: number, fn: () => void) => timers.push(setInterval(fn, ms))
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
  let unsubscribe: (() => void) | null = null
  const path = new URL(url, window.location.origin).pathname.replace(/^\/api\/s\/[^/]+/, '/api')

  later(0, () => {
    options.onOpen?.(false)
    if (path === '/api/events') {
      send('snapshot', { deployments: activeDeployments() })
      unsubscribe = onDeployment((deployment) =>
        send('status', {
          deploymentId: deployment.id,
          projectId: deployment.projectId,
          status: deployment.status,
          deployment,
        }),
      )
    } else if (path === '/api/metrics/stream') {
      const at = Date.now()
      send('history', {
        samples: Array.from({ length: 90 }, (_, i) => demoSample(at - (90 - i) * 2000)),
      })
      every(2000, () => send('sample', demoSample()))
    } else if (path.endsWith('/runtime-logs/stream')) {
      const projectId = path.split('/')[3] ?? ''
      if (!isRunning(projectId)) {
        send('end', { reason: 'not_running' })
        return
      }
      for (let i = 0; i < 8; i++) send('log', { line: demoRuntimeLine(projectId) })
      every(1800, () => send('log', { line: demoRuntimeLine(projectId) }))
    } else if (path.endsWith('/logs/stream')) {
      const id = path.split('/')[3] ?? ''
      const deployment = demoDeployment(id)
      if (!deployment) return send('done', {})
      if (deployment.status === 'ready' || deployment.status === 'failed') {
        for (const line of demoLog(deployment)) send('log', line)
        return send('done', {})
      }
      // The live deploy: write its log as it goes.
      let written = -1
      const pump = () => {
        const current = demoDeployment(id)!
        for (const line of liveLogLines(current)) {
          if (line.seq > written) {
            send('log', line)
            written = line.seq
          }
        }
        if (current.status === 'ready' || current.status === 'failed') send('done', {})
      }
      pump()
      every(700, pump)
    }
  })

  return {
    close() {
      for (const timer of timers) clearTimeout(timer)
      unsubscribe?.()
    },
  }
}
