import { lookup } from 'node:dns/promises'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import type { Endpoint } from '@hangar/shared'
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import { z } from 'zod'
import type { Ctx } from '../context.ts'
import { UserError } from '../errors.ts'
import {
  type AuthenticatedSession,
  csrfTokenFor,
  isValidCsrfToken,
  resolveSession,
} from '../modules/auth/service.ts'
import { type AccessPolicyCache, classifyRequest, createAccessPolicy } from './access.ts'
import { type EventStream, openEventStream } from './sse.ts'

export const SESSION_COOKIE = 'hangar_session'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedSession | null
  }
}

/** What route modules receive. */
export interface Http {
  app: FastifyInstance
  ctx: Ctx
  access: AccessPolicyCache
  /** Unknown page paths get the dashboard's index.html (its router takes over) while `available`. */
  enableDashboardFallback(available: () => boolean): void
}

const APP_NOT_RUNNING_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>App not running</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#222}</style>
</head><body><h1>This app isn't running</h1>
<p>Nothing is deployed at this address right now, or the app has been stopped.
Open the Control Tower to check its status.</p></body></html>`

/**
 * Addresses of Traefik, the only proxy in front of core. Other peers on the hangar network (app
 * containers) can reach core directly, and must not be able to choose their own client address.
 */
function trackProxyAddresses(host: string) {
  const addresses = new Set<string>()
  const refresh = () =>
    lookup(host, { all: true })
      .then((found) => {
        addresses.clear()
        for (const { address } of found) addresses.add(address)
      })
      .catch(() => addresses.clear())
  void refresh()
  setInterval(refresh, 60_000).unref()
  return (address: string) => addresses.has(address.replace(/^::ffff:/, ''))
}

export function createHttpServer(ctx: Ctx): Http {
  const isProxy = trackProxyAddresses(ctx.config.proxyHost)
  const app = Fastify({
    loggerInstance: ctx.log as FastifyBaseLogger,
    // Trust the one X-Forwarded-For hop Traefik adds, and only when the request came from Traefik.
    trustProxy: (address: string, hop: number) => hop === 0 && isProxy(address),
    bodyLimit: 1024 * 1024,
  })
  const access = createAccessPolicy(ctx)

  app.register(cookie, { secret: ctx.config.sessionSecret })
  app.register(rateLimit, { global: false })
  app.decorateRequest('auth', null)

  app.addHook('onRequest', async (request, reply) => {
    const area = classifyRequest(await access.get(), {
      host: request.headers.host,
      path: request.url,
      headers: request.headers,
    })
    if (area === 'not-found') {
      return reply.code(404).type('text/plain').send('Not found')
    }
    if (area === 'app-not-running') {
      return reply.code(404).type('text/html').send(APP_NOT_RUNNING_PAGE)
    }
    if (area === 'api' && !SAFE_METHODS.has(request.method)) {
      // Browsers always send Origin on these methods. Requiring a known origin stops other sites
      // (including apps on sibling sslip.io names, which are "same-site") from sending requests.
      const origin = request.headers.origin
      if (!origin || !(await access.get()).origins.has(origin)) {
        throw new UserError(403, 'bad_origin', 'This request did not come from the Control Tower.')
      }
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UserError) {
      return reply
        .code(error.status)
        .send({ error: { code: error.code, message: error.message, hint: error.hint } })
    }
    if (error instanceof z.ZodError) {
      const issue = error.issues[0]
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
      return reply.code(400).send({
        error: { code: 'invalid_input', message: `${where}${issue?.message ?? 'Invalid input'}` },
      })
    }
    // Only Fastify's own errors (bad JSON, body too large, rate limit) are client errors here;
    // other libraries (dockerode) put upstream HTTP statuses on their errors.
    const { statusCode: status = 500, code } = error as { statusCode?: number; code?: string }
    if (status < 500 && (code?.startsWith('FST_') || status === 429)) {
      const message = (error as Error).message
      return reply.code(status).send({ error: { code: 'bad_request', message } })
    }
    request.log.error({ err: error }, 'Request failed')
    return reply.code(500).send({
      error: { code: 'internal', message: 'Something went wrong on the server. Check its logs.' },
    })
  })

  let dashboardFallback: () => boolean = () => false
  app.setNotFoundHandler((request, reply) => {
    // Pages of the dashboard's own router get index.html. Missing build files (/assets/…) and API
    // paths get a real 404, so an outdated tab notices instead of running HTML as a script.
    const path = request.url.split('?')[0]!
    const isPage = !path.startsWith('/api/') && !path.startsWith('/assets/')
    if (request.method === 'GET' && isPage && dashboardFallback()) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    }
    return reply.code(404).send({ error: { code: 'not_found', message: 'No such endpoint' } })
  })

  return {
    app,
    ctx,
    access,
    enableDashboardFallback: (available) => {
      dashboardFallback = available
    },
  }
}

export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
) {
  reply.setCookie(SESSION_COOKIE, token, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: request.protocol === 'https',
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** Loads the session from the cookie; for non-GET requests also checks the CSRF token. */
export async function authenticate(
  ctx: Ctx,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthenticatedSession> {
  const raw = request.cookies[SESSION_COOKIE]
  const unsigned = raw ? request.unsignCookie(raw) : null
  const session =
    unsigned?.valid && unsigned.value ? await resolveSession(ctx, unsigned.value) : null
  if (!session) {
    throw new UserError(401, 'unauthenticated', 'Sign in to continue.')
  }
  if (session.refreshed) setSessionCookie(request, reply, unsigned!.value!, session.expiresAt)
  if (!SAFE_METHODS.has(request.method)) {
    const token = request.headers['x-csrf-token']
    if (!isValidCsrfToken(ctx, session.sessionId, typeof token === 'string' ? token : undefined)) {
      throw new UserError(
        403,
        'bad_csrf_token',
        'Your session token is missing or out of date. Reload the page.',
      )
    }
  }
  request.auth = session
  return session
}

export function sessionView(ctx: Ctx, session: Pick<AuthenticatedSession, 'sessionId' | 'user'>) {
  return { user: session.user, csrfToken: csrfTokenFor(ctx, session.sessionId) }
}

type Parsed<T> = T extends z.ZodType ? z.output<T> : undefined

export interface HandlerInput<E extends Endpoint> {
  params: Parsed<E['params']>
  query: Parsed<E['query']>
  body: Parsed<E['body']>
  auth: E['access'] extends 'session' ? AuthenticatedSession : null
  request: FastifyRequest
  reply: FastifyReply
}

export interface RouteOptions {
  /** Requests per minute per client address. */
  rateLimit?: number
}

/**
 * Registers one contract endpoint: validates params, query, and body, enforces its access level,
 * and parses the result through the response schema, which drops any field it does not declare.
 */
export function route<E extends Endpoint>(
  { app, ctx }: Http,
  endpoint: E,
  handler: (input: HandlerInput<E>) => Promise<z.input<E['response']>>,
  options: RouteOptions = {},
) {
  app.route({
    method: endpoint.method,
    url: endpoint.path,
    config: options.rateLimit
      ? { rateLimit: { max: options.rateLimit, timeWindow: '1 minute' } }
      : {},
    handler: async (request, reply) => {
      const auth = endpoint.access === 'session' ? await authenticate(ctx, request, reply) : null
      const input = {
        params: endpoint.params?.parse(request.params),
        query: endpoint.query?.parse(request.query),
        body: endpoint.body?.parse(request.body ?? {}),
        auth,
        request,
        reply,
      } as HandlerInput<E>
      return endpoint.response.parse(await handler(input))
    },
  })
}

/**
 * Registers a server-sent event stream that needs a session. Params are validated and `prepare`
 * runs before the stream opens, so not-found and similar errors still get a normal JSON response.
 */
export function eventStream<P extends z.ZodType, T>(
  { app, ctx }: Http,
  path: string,
  params: P,
  prepare: (params: z.output<P>, request: FastifyRequest) => Promise<T>,
  run: (stream: EventStream, prepared: T, request: FastifyRequest) => Promise<void>,
) {
  app.get(path, async (request, reply) => {
    await authenticate(ctx, request, reply)
    const prepared = await prepare(params.parse(request.params), request)
    const stream = openEventStream(request, reply)
    try {
      await run(stream, prepared, request)
    } catch (error) {
      request.log.error({ err: error }, 'Event stream failed')
      stream.close()
    }
  })
}

/** Body of endpoints that only confirm success. */
export const OK = { ok: true } as const
