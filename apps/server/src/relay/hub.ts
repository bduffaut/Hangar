// The central side of the relay (D38): people's servers connect here and stay connected, and
// requests for a server go down its connection. In memory: one process holds every connection.
import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { AGENT_CONNECT_PATH } from '@hangar/shared'
import { type WebSocket, WebSocketServer } from 'ws'
import type { Ctx } from '../context.ts'
import { classifyRequest } from '../http/access.ts'
import type { Http } from '../http/server.ts'
import {
  getServerByCredential,
  pairServer,
  type Server,
  updateServer,
} from '../modules/servers/repo.ts'
import { getUserById } from '../modules/auth/repo.ts'
import { getGithubToken } from '../modules/settings/secrets.ts'
import {
  CLOSE_REMOVED,
  CLOSE_REPLACED,
  MAX_FRAME_BYTES,
  type ToCentral,
  type ToServer,
  toCentral,
} from './protocol.ts'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const PING_MS = 25_000
/** A request with no answer by then fails; streams are exempt once their headers arrive. */
const ANSWER_TIMEOUT_MS = 120_000
const SEEN_WRITE_MS = 60_000
const MAX_PENDING = 500

/** Where a relayed answer goes. */
export interface ResponseSink {
  head(status: number, headers: Record<string, string>): void
  data(chunk: Buffer): void
  end(): void
  /** The server went away, or never answered. */
  fail(reason: 'offline' | 'timeout'): void
}

interface Connection {
  server: Server
  socket: WebSocket
  pending: Map<number, { sink: ResponseSink; timer: NodeJS.Timeout | null }>
  nextId: number
  lastSeenWrite: number
}

export type Hub = ReturnType<typeof createHub>

export function createHub(ctx: Ctx) {
  const connections = new Map<string, Connection>()
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })

  const send = (conn: Connection, message: ToServer) => {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(message))
  }

  function finish(conn: Connection, id: number) {
    const entry = conn.pending.get(id)
    if (entry?.timer) clearTimeout(entry.timer)
    conn.pending.delete(id)
    return entry
  }

  async function onMessage(conn: Connection, raw: string) {
    let message: ToCentral
    try {
      message = toCentral.parse(JSON.parse(raw))
    } catch {
      return // a newer server may send things this one does not know
    }
    switch (message.t) {
      case 'hello':
        await updateServer(ctx.db, conn.server.id, { info: message.info, lastSeenAt: new Date() })
        return
      case 'head': {
        const entry = conn.pending.get(message.id)
        if (!entry) return
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = null
        entry.sink.head(message.status, message.headers)
        return
      }
      case 'data':
        conn.pending.get(message.id)?.sink.data(Buffer.from(message.chunk, 'base64'))
        return
      case 'end':
        finish(conn, message.id)?.sink.end()
        return
      case 'rpc': {
        // Its owner's GitHub token, renewed here when needed: the GitHub App's secret stays here.
        const token = await getGithubToken(ctx, conn.server.ownerId).catch(() => null)
        send(conn, { t: 'rpc-res', id: message.id, result: token })
        return
      }
    }
  }

  function accept(server: Server, socket: WebSocket, paired?: ToServer) {
    connections.get(server.id)?.socket.close(CLOSE_REPLACED, 'Replaced by a newer connection')
    const conn: Connection = {
      server,
      socket,
      pending: new Map(),
      nextId: 1,
      lastSeenWrite: 0,
    }
    connections.set(server.id, conn)
    if (paired) send(conn, paired)
    let alive = true
    const ping = setInterval(() => {
      if (!alive) return socket.terminate()
      alive = false
      socket.ping()
    }, PING_MS)
    socket.on('pong', () => {
      alive = true
      if (Date.now() - conn.lastSeenWrite > SEEN_WRITE_MS) {
        conn.lastSeenWrite = Date.now()
        void updateServer(ctx.db, server.id, { lastSeenAt: new Date() }).catch(() => {})
      }
    })
    socket.on('message', (data) => {
      onMessage(conn, String(data)).catch((error: unknown) =>
        ctx.log.warn({ err: error, server: server.id }, 'Relay message failed'),
      )
    })
    socket.on('close', () => {
      clearInterval(ping)
      if (connections.get(server.id) === conn) connections.delete(server.id)
      for (const id of [...conn.pending.keys()]) finish(conn, id)?.sink.fail('offline')
      void updateServer(ctx.db, server.id, { lastSeenAt: new Date() }).catch(() => {})
      ctx.log.info({ server: server.id }, 'A server disconnected')
    })
    socket.on('error', () => socket.terminate())
    ctx.log.info({ server: server.id, name: server.name }, 'A server connected')
  }

  /** Checks the key (or the one-time pairing code) a connecting server presents. */
  async function authorize(request: IncomingMessage) {
    const auth = request.headers.authorization
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const server = await getServerByCredential(ctx.db, sha256(auth.slice(7)))
      return server ? { server, paired: undefined } : null
    }
    const code = request.headers['x-hangar-pairing']
    if (typeof code !== 'string' || code.length < 10 || code.length > 100) return null
    const credential = randomBytes(32).toString('base64url')
    const server = await pairServer(ctx.db, sha256(code), sha256(credential))
    if (!server) return null
    const owner = await getUserById(ctx.db, server.ownerId)
    if (!owner) return null
    ctx.log.info({ server: server.id }, 'A server paired')
    const paired: ToServer = {
      t: 'paired',
      serverId: server.id,
      credential,
      username: owner.username,
    }
    return { server, paired }
  }

  function refuse(socket: Duplex, status: number) {
    socket.write(`HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Not Found'}\r\n\r\n`)
    socket.destroy()
  }

  return {
    /** Takes WebSocket upgrades on AGENT_CONNECT_PATH, from Control Tower hostnames only. */
    attach(http: Http) {
      http.app.server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        void (async () => {
          const path = (request.url ?? '').split('?')[0]
          const peer = request.socket.remoteAddress ?? ''
          if (path !== AGENT_CONNECT_PATH || !(await http.isTrustedPeer(peer))) {
            return refuse(socket, 404)
          }
          const area = classifyRequest(await http.access.get(), {
            host: request.headers.host,
            path: path!,
            headers: request.headers as Record<string, unknown>,
          })
          if (area !== 'api') return refuse(socket, 404)
          const authorized = await authorize(request)
          if (!authorized) return refuse(socket, 401)
          wss.handleUpgrade(request, socket, head, (ws) =>
            accept(authorized.server, ws, authorized.paired),
          )
        })().catch((error: unknown) => {
          ctx.log.warn({ err: error }, 'A server could not connect')
          refuse(socket, 401)
        })
      })
    },

    isOnline: (serverId: string) => connections.has(serverId),

    /** Sends one request to a server. Returns a function that cancels it. */
    forward(
      serverId: string,
      request: { method: string; path: string; headers: Record<string, string>; body?: string },
      sink: ResponseSink,
    ): () => void {
      const conn = connections.get(serverId)
      if (!conn || conn.pending.size >= MAX_PENDING) {
        sink.fail('offline')
        return () => {}
      }
      const id = conn.nextId++
      const timer = setTimeout(() => finish(conn, id)?.sink.fail('timeout'), ANSWER_TIMEOUT_MS)
      conn.pending.set(id, { sink, timer })
      send(conn, { t: 'req', id, ...request })
      return () => {
        if (finish(conn, id)) send(conn, { t: 'cancel', id })
      }
    },

    /** A removed server is told to stop: it forgets this Hangar and does not reconnect. */
    disconnect(serverId: string) {
      connections.get(serverId)?.socket.close(CLOSE_REMOVED, 'Removed')
    },

    close() {
      for (const conn of connections.values()) conn.socket.terminate()
      wss.close()
    },
  }
}
