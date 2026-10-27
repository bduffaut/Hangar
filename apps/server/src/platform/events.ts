import type pg from 'pg'
import type { Logger } from '../logger.ts'

// Postgres LISTEN/NOTIFY carries small signals between modules (and, later, processes). Payloads
// only point at rows; subscribers read the details from the database.
export interface EventMap {
  deployment_status: { deploymentId: string; projectId: string; status: string }
  deployment_logs: { deploymentId: string; seq: number }
  deployment_cancel: { deploymentId: string }
}

export type EventName = keyof EventMap
type Handler<E extends EventName> = (payload: EventMap[E]) => void

const RECONNECT_DELAY_MS = 2_000

export function createEvents(pool: pg.Pool, log: Logger) {
  const handlers = new Map<EventName, Set<Handler<never>>>()
  let listener: pg.PoolClient | null = null
  let connecting: Promise<void> | null = null
  let closed = false

  async function connect(): Promise<void> {
    const client = await pool.connect()
    client.on('notification', (message) => {
      const set = handlers.get(message.channel as EventName)
      if (!set || !message.payload) return
      const payload = JSON.parse(message.payload) as never
      for (const handler of set) handler(payload)
    })
    client.on('error', (error) => {
      log.warn({ err: error }, 'Lost the database event listener; reconnecting')
      client.release(error)
      listener = null
      if (!closed) setTimeout(() => void ensureListener().catch(() => {}), RECONNECT_DELAY_MS)
    })
    for (const channel of handlers.keys()) await client.query(`listen ${channel}`)
    listener = client
  }

  function ensureListener(): Promise<void> {
    if (listener) return Promise.resolve()
    connecting ??= connect().finally(() => (connecting = null))
    return connecting
  }

  return {
    async publish<E extends EventName>(event: E, payload: EventMap[E]): Promise<void> {
      await pool.query('select pg_notify($1, $2)', [event, JSON.stringify(payload)])
    },

    /** Returns a function that removes the handler. */
    async subscribe<E extends EventName>(event: E, handler: Handler<E>): Promise<() => void> {
      let set = handlers.get(event)
      if (!set) {
        set = new Set()
        handlers.set(event, set)
        // Channel names come from EventMap keys, never from input, so interpolation is safe.
        if (listener) await listener.query(`listen ${event}`)
      }
      set.add(handler as Handler<never>)
      await ensureListener()
      return () => set.delete(handler as Handler<never>)
    },

    async close(): Promise<void> {
      closed = true
      listener?.release()
      listener = null
    },
  }
}

export type Events = ReturnType<typeof createEvents>
