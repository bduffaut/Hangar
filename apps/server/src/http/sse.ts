import type { FastifyReply, FastifyRequest } from 'fastify'

const HEARTBEAT_MS = 15_000

export interface EventStream {
  send(event: string, data: unknown, id?: number): void
  close(): void
  /** Runs when the stream closes, from either side. */
  onClose(fn: () => void): void
  readonly closed: boolean
  /** Aborts when the stream closes; pass it to anything the stream is waiting on. */
  readonly signal: AbortSignal
}

/** Takes over the response and turns it into a server-sent event stream. */
export function openEventStream(request: FastifyRequest, reply: FastifyReply): EventStream {
  reply.hijack()
  const res = reply.raw
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')

  const controller = new AbortController()
  const cleanups: (() => void)[] = []
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS)

  const close = () => {
    if (controller.signal.aborted) return
    controller.abort()
    clearInterval(heartbeat)
    for (const fn of cleanups) fn()
    res.end()
  }
  request.raw.on('close', close)

  return {
    send(event, data, id) {
      if (controller.signal.aborted) return
      const idLine = id === undefined ? '' : `id: ${id}\n`
      res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    },
    close,
    onClose: (fn) => cleanups.push(fn),
    get closed() {
      return controller.signal.aborted
    },
    signal: controller.signal,
  }
}
