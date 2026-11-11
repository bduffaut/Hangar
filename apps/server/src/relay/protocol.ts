// The relay between a Hangar people sign in to (the central one) and their own servers (D38).
// A server opens one WebSocket to the central Hangar and keeps it open; HTTP requests for it travel
// down that connection and the answers, streams included, travel back. JSON text frames only.
import { contract, streams } from '@hangar/shared'
import { z } from 'zod'

/** Sent by the server on every connection. */
export const serverHello = z.object({
  version: z.string().max(100),
  hostname: z.string().max(253),
  os: z.string().max(200),
  arch: z.string().max(50),
  cpus: z.number().int().min(0).max(4096),
  memoryBytes: z.number().min(0),
  lanIp: z.string().max(45).nullable(),
})

export const toServer = z.discriminatedUnion('t', [
  /** Pairing worked: the key to connect with from now on, and whose server this is. */
  z.object({
    t: z.literal('paired'),
    serverId: z.string(),
    credential: z.string(),
    username: z.string(),
  }),
  z.object({
    t: z.literal('req'),
    id: z.number(),
    method: z.string(),
    /** Path and query, starting with /api/. */
    path: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.string().optional(),
  }),
  z.object({ t: z.literal('cancel'), id: z.number() }),
  z.object({
    t: z.literal('rpc-res'),
    id: z.number(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),
])
export type ToServer = z.infer<typeof toServer>

export const toCentral = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), info: serverHello }),
  z.object({
    t: z.literal('head'),
    id: z.number(),
    status: z.number(),
    headers: z.record(z.string(), z.string()),
  }),
  /** A piece of the response body, base64. */
  z.object({ t: z.literal('data'), id: z.number(), chunk: z.string() }),
  z.object({ t: z.literal('end'), id: z.number() }),
  /** The server asks the central Hangar for something: its owner's GitHub token. */
  z.object({ t: z.literal('rpc'), id: z.number(), method: z.literal('githubToken') }),
])
export type ToCentral = z.infer<typeof toCentral>

/** WebSocket close codes. 4001: the server was removed; it stops trying. */
export const CLOSE_REMOVED = 4001
export const CLOSE_REPLACED = 4002

/** Request and response headers that cross the relay. Cookies never do. */
export const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'last-event-id']
export const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'x-accel-buffering']

export const MAX_FRAME_BYTES = 4 * 1024 * 1024

// Only a server's own business crosses the relay: its projects, deployments, env vars, settings,
// and streams. Accounts, invites, and sign-in stay with the central Hangar.
const serverPaths = [
  ...Object.values(contract)
    .filter((e) => 'scope' in e && e.scope === 'server')
    .map((e) => ({ method: e.method as string, path: e.path as string })),
  ...Object.values(streams).map((path) => ({ method: 'GET', path })),
].map(({ method, path }) => ({
  method,
  pattern: new RegExp(`^${path.replace(/:[a-zA-Z]+/g, '[^/]+')}$`),
}))

/** Whether a request (path with or without its query) may be relayed to a server. */
export function isServerRequest(method: string, path: string): boolean {
  const bare = path.split('?')[0]!
  return serverPaths.some((p) => p.method === method && p.pattern.test(bare))
}
