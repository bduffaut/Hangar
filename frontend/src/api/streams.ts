// Server-sent event streams that stay connected. The browser retries by itself after a network
// drop, but gives up for good when the server answers with an error (for example while Hangar
// restarts during an update); this reopens the stream with a growing delay in that case too.
import { type StreamName, streams } from '@hangar/shared'

export interface Stream {
  close(): void
}

export interface StreamOptions {
  /** Called on every (re)connection. A stream that replays history should reset here. */
  onOpen?: (reconnect: boolean) => void
  /** Called when the connection drops (it is retried automatically). */
  onError?: () => void
}

const MAX_DELAY_MS = 30_000

/** The URL of a named stream from the contract, e.g. streamUrl('deploymentLogs', { id }). */
export function streamUrl(
  name: StreamName,
  params: Record<string, string> = {},
  query: Record<string, string | number> = {},
): string {
  const path = streams[name].replace(/:(\w+)/g, (_, key: string) =>
    encodeURIComponent(params[key] ?? ''),
  )
  const search = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString()
  return search ? `${path}?${search}` : path
}

/**
 * Opens a stream. `url` may be a function so a reconnection can ask to resume (for example the
 * build log's `?after=<last line>`).
 */
export function openStream(
  url: string | (() => string),
  handlers: Record<string, (data: never) => void>,
  options: StreamOptions = {},
): Stream {
  let source: EventSource | null = null
  let closed = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let delay = 1000
  let opens = 0

  const connect = () => {
    source = new EventSource(typeof url === 'function' ? url() : url, { withCredentials: true })
    source.onopen = () => {
      delay = 1000
      options.onOpen?.(opens++ > 0)
    }
    for (const [event, handler] of Object.entries(handlers)) {
      source.addEventListener(event, (message) => {
        handler(JSON.parse((message as MessageEvent<string>).data) as never)
      })
    }
    source.onerror = () => {
      options.onError?.()
      if (closed || source?.readyState !== EventSource.CLOSED) return
      // The browser will not retry this one; do it ourselves.
      retryTimer = setTimeout(connect, delay)
      delay = Math.min(delay * 2, MAX_DELAY_MS)
    }
  }
  connect()

  return {
    close() {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      source?.close()
    },
  }
}
