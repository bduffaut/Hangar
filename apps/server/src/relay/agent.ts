// The server side of the relay (D38): on a person's own machine, Hangar keeps one WebSocket open
// to the Hangar they signed in to, runs the requests that arrive on it against itself, and streams
// the answers back. It only ever connects out, so the machine needs no open port.
import { eq } from 'drizzle-orm'
import { AGENT_CONNECT_PATH, USERNAME_PATTERN } from '@hangar/shared'
import { WebSocket } from 'ws'
import type { Ctx } from '../context.ts'
import { users } from '../db/schema.ts'
import { RELAY_SECRET, RELAY_SECRET_HEADER, RELAY_USER_HEADER } from '../http/server.ts'
import { getSettings, setSettings } from '../modules/settings/repo.ts'
import {
  CLOSE_REMOVED,
  FORWARDED_RESPONSE_HEADERS,
  isServerRequest,
  MAX_FRAME_BYTES,
  type ToCentral,
  toServer,
} from './protocol.ts'

export const CENTRAL_CREDENTIAL_AAD = 'setting:central'

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 60_000
/** After a refused key, wait longer: retrying fast would not help. */
const REFUSED_BACKOFF_MS = 5 * 60_000
const RPC_TIMEOUT_MS = 10_000
const TOKEN_CACHE_MS = 5 * 60_000
/** Base64 frames stay well under the central Hangar's frame limit. */
const CHUNK_BYTES = 256 * 1024

/** What the rest of Hangar uses: whose requests come from there, and their GitHub token. */
export interface CentralLink {
  /** The account here that requests from the central Hangar run as. */
  isRelayUser(userId: string): boolean
  githubToken(): Promise<string | null>
  /** Connected right now. */
  connected(): boolean
  stop(): void
}

export function startAgent(ctx: Ctx, options: { port: number }): CentralLink {
  let socket: WebSocket | null = null
  let stopped = false
  let backoff = MIN_BACKOFF_MS
  let retry: NodeJS.Timeout | null = null
  let localUserId: string | null = null
  let nextRpc = 1
  const rpcs = new Map<number, (result: unknown) => void>()
  const requests = new Map<number, AbortController>()
  let token: { value: string | null; at: number } | null = null

  const send = (message: ToCentral) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  function schedule(delay: number) {
    if (stopped || retry) return
    retry = setTimeout(() => {
      retry = null
      void connect()
    }, delay)
    retry.unref()
  }

  /** Makes (or finds) the account the person's requests run as, and saves the key. */
  async function onPaired(message: { serverId: string; credential: string; username: string }) {
    const username = USERNAME_PATTERN.test(message.username) ? message.username : 'owner'
    const [existing] = await ctx.db.select().from(users).where(eq(users.username, username))
    const user =
      existing ??
      (
        await ctx.db
          .insert(users)
          .values({ username, passwordHash: null, role: 'admin', localAccess: true })
          .returning()
      )[0]!
    localUserId = user.id
    await setSettings(ctx.db, {
      central: {
        url: ctx.config.centralUrl!,
        serverId: message.serverId,
        credential: ctx.crypto.seal(message.credential, CENTRAL_CREDENTIAL_AAD),
        localUserId: user.id,
      },
    })
    ctx.log.info({ central: ctx.config.centralUrl, username }, 'Paired with the central Hangar')
  }

  /** Runs one request against this server, over loopback, as the paired account. */
  async function execute(message: {
    id: number
    method: string
    path: string
    headers: Record<string, string>
    body?: string
  }) {
    const { id } = message
    if (!localUserId || !isServerRequest(message.method, message.path)) {
      send({ t: 'head', id, status: 404, headers: { 'content-type': 'application/json' } })
      send({
        t: 'data',
        id,
        chunk: Buffer.from('{"error":{"code":"not_found","message":"No such endpoint"}}').toString(
          'base64',
        ),
      })
      send({ t: 'end', id })
      return
    }
    const abort = new AbortController()
    requests.set(id, abort)
    try {
      const response = await fetch(`http://127.0.0.1:${options.port}${message.path}`, {
        method: message.method,
        headers: {
          ...message.headers,
          [RELAY_SECRET_HEADER]: RELAY_SECRET,
          [RELAY_USER_HEADER]: localUserId,
        },
        body: message.body,
        signal: abort.signal,
      })
      const headers: Record<string, string> = {}
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = response.headers.get(name)
        if (value) headers[name] = value
      }
      send({ t: 'head', id, status: response.status, headers })
      if (response.body) {
        for await (const piece of response.body) {
          const buffer = Buffer.from(piece)
          for (let at = 0; at < buffer.length; at += CHUNK_BYTES) {
            send({ t: 'data', id, chunk: buffer.subarray(at, at + CHUNK_BYTES).toString('base64') })
          }
        }
      }
    } catch (error) {
      if (!abort.signal.aborted)
        ctx.log.warn({ err: error, path: message.path }, 'Relayed request failed')
    } finally {
      requests.delete(id)
      send({ t: 'end', id })
    }
  }

  async function hello() {
    const info = await ctx.docker.hostInfo().catch(() => ({
      hostname: 'unknown',
      os: 'unknown',
      arch: 'unknown',
      cpus: 0,
      memoryBytes: 0,
    }))
    const { lanIp } = await getSettings(ctx.db)
    send({ t: 'hello', info: { version: ctx.config.version, ...info, lanIp } })
  }

  async function connect() {
    if (stopped) return
    const { central } = await getSettings(ctx.db)
    const base = central?.url ?? ctx.config.centralUrl
    if (!base) return
    localUserId = central?.localUserId ?? null
    const headers: Record<string, string> = {}
    if (central) {
      headers.authorization = `Bearer ${ctx.crypto.open(central.credential, CENTRAL_CREDENTIAL_AAD)}`
    } else if (ctx.config.pairingCode) {
      headers['x-hangar-pairing'] = ctx.config.pairingCode
    } else {
      ctx.log.warn('This server is not paired yet and has no pairing code; add it again there')
      return
    }

    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}${AGENT_CONNECT_PATH}`, {
      headers,
      maxPayload: MAX_FRAME_BYTES,
      handshakeTimeout: 15_000,
    })
    socket = ws
    ws.on('open', () => {
      backoff = MIN_BACKOFF_MS
      ctx.log.info({ central: base }, 'Connected to the central Hangar')
      void hello()
    })
    ws.on('unexpected-response', (_request, response) => {
      ctx.log.warn(
        { central: base, status: response.statusCode },
        response.statusCode === 401
          ? 'The central Hangar refused this server; add it again there to get a new command'
          : 'Could not connect to the central Hangar',
      )
      ws.terminate()
      if (response.statusCode === 401) {
        socket = null
        schedule(REFUSED_BACKOFF_MS)
      }
    })
    ws.on('message', (data) => {
      let message
      try {
        message = toServer.parse(JSON.parse(String(data)))
      } catch {
        return
      }
      switch (message.t) {
        case 'paired':
          void onPaired(message).then(hello)
          return
        case 'req':
          void execute(message)
          return
        case 'cancel':
          requests.get(message.id)?.abort()
          return
        case 'rpc-res':
          rpcs.get(message.id)?.(message.result ?? null)
          rpcs.delete(message.id)
          return
      }
    })
    ws.on('close', (code) => {
      if (socket === ws) socket = null
      for (const abort of requests.values()) abort.abort()
      requests.clear()
      if (code === CLOSE_REMOVED) {
        // Removed there: forget it, so this server stops knocking.
        ctx.log.info('This server was removed from the central Hangar')
        void setSettings(ctx.db, { central: null })
        localUserId = null
        return
      }
      schedule(backoff)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
    })
    ws.on('error', (error) => ctx.log.debug({ err: error }, 'Central connection error'))
  }

  void connect().catch((error: unknown) => {
    ctx.log.warn({ err: error }, 'Could not start the connection to the central Hangar')
    schedule(MAX_BACKOFF_MS)
  })

  return {
    isRelayUser: (userId) => userId === localUserId,
    connected: () => socket?.readyState === WebSocket.OPEN,
    async githubToken() {
      if (token && Date.now() - token.at < TOKEN_CACHE_MS) return token.value
      if (socket?.readyState !== WebSocket.OPEN) return token?.value ?? null
      const id = nextRpc++
      const result = await new Promise<unknown>((resolve) => {
        const timer = setTimeout(() => {
          rpcs.delete(id)
          resolve(token?.value ?? null)
        }, RPC_TIMEOUT_MS)
        rpcs.set(id, (value) => {
          clearTimeout(timer)
          resolve(value)
        })
        send({ t: 'rpc', id, method: 'githubToken' })
      })
      const value = typeof result === 'string' ? result : null
      // Only a token is remembered: someone who connects GitHub there can deploy right away.
      token = value ? { value, at: Date.now() } : null
      return value
    },
    stop() {
      stopped = true
      if (retry) clearTimeout(retry)
      socket?.close()
    },
  }
}
