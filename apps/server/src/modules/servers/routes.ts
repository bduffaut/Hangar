import { contract, INSTALL_SCRIPT_PATH, SERVER_PREFIX } from '@hangar/shared'
import { z } from 'zod'
import { UserError } from '../../errors.ts'
import { authenticate, type Http, OK, parseInput, requestOrigin, route } from '../../http/server.ts'
import { ENTRYPOINT_HEADER } from '../../platform/proxy.ts'
import { createHub } from '../../relay/hub.ts'
import { FORWARDED_REQUEST_HEADERS, isServerRequest } from '../../relay/protocol.ts'
import { getServerOf } from './repo.ts'
import {
  addServer,
  installScript,
  newPairing,
  removeServer,
  renameServer,
  serverViews,
} from './service.ts'

const SERVER_ERROR = {
  offline: {
    status: 503,
    code: 'server_offline',
    message: 'Your server is not connected right now.',
    hint: 'Check that it is on and online. It reconnects by itself.',
  },
  timeout: {
    status: 504,
    code: 'server_timeout',
    message: 'Your server did not answer in time.',
    hint: 'It may be busy. Try again in a moment.',
  },
}

/** The public address a request came in on, for the install command (https behind the tunnel). */
function publicOrigin(request: Parameters<typeof requestOrigin>[0]): string {
  const host = request.headers.host ?? 'localhost'
  const isPublic = request.headers[ENTRYPOINT_HEADER.toLowerCase()] === 'public'
  return `${isPublic ? 'https' : 'http'}://${host}`
}

export function serverRoutes(http: Http) {
  const { ctx, app } = http
  const hub = createHub(ctx)
  hub.attach(http)
  app.addHook('onClose', async () => hub.close())

  route(http, contract.listServers, ({ auth }) => serverViews(ctx, hub, auth.user.id))

  route(http, contract.addServer, ({ auth, body, request }) =>
    addServer(ctx, hub, auth.user.id, body.name, requestOrigin(request)),
  )

  route(http, contract.newPairingCode, ({ auth, params, request }) =>
    newPairing(ctx, hub, auth.user.id, params.id, requestOrigin(request)),
  )

  route(http, contract.renameServer, ({ auth, params, body }) =>
    renameServer(ctx, hub, auth.user.id, params.id, body.name),
  )

  route(http, contract.removeServer, async ({ auth, params }) => {
    await removeServer(ctx, hub, auth.user.id, params.id)
    return OK
  })

  app.get(INSTALL_SCRIPT_PATH, async (request, reply) =>
    reply
      .type('text/x-shellscript; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(installScript(ctx, publicOrigin(request))),
  )

  // A connected server's own endpoints: /api/s/:serverId/projects → its /api/projects. The
  // session and CSRF token are checked here; the server runs the request as its paired account.
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: `${SERVER_PREFIX}/*`,
    handler: async (request, reply) => {
      const auth = await authenticate(ctx, request, reply)
      const params = parseInput(z.object({ serverId: z.uuid(), '*': z.string() }), request.params)
      const server = await getServerOf(ctx.db, params.serverId, auth.user.id)
      if (!server) throw new UserError(404, 'not_found', 'Server not found')
      const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''
      const path = `/api/${params['*']}${query}`
      if (!isServerRequest(request.method, path)) {
        throw new UserError(404, 'not_found', 'No such endpoint')
      }
      const headers: Record<string, string> = {}
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers[name]
        if (typeof value === 'string') headers[name] = value
      }
      const body =
        request.body === undefined || request.body === null
          ? undefined
          : JSON.stringify(request.body)

      reply.hijack()
      const raw = reply.raw
      await new Promise<void>((resolve) => {
        let started = false
        const cancel = hub.forward(
          server.id,
          { method: request.method, path, headers, body },
          {
            head(status, responseHeaders) {
              started = true
              raw.writeHead(status, {
                ...responseHeaders,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': responseHeaders['cache-control'] ?? 'no-store',
              })
              // Streams must reach the browser as they come.
              raw.flushHeaders()
            },
            data: (chunk) => raw.write(chunk),
            end() {
              raw.end()
              resolve()
            },
            fail(reason) {
              const error = SERVER_ERROR[reason]
              if (!started) {
                raw.writeHead(error.status, { 'Content-Type': 'application/json' })
                raw.end(
                  JSON.stringify({
                    error: { code: error.code, message: error.message, hint: error.hint },
                  }),
                )
              } else raw.end()
              resolve()
            },
          },
        )
        // The browser left (a closed tab ends a log stream): stop the work on the server too.
        raw.on('close', () => {
          cancel()
          resolve()
        })
      })
    },
  })
}
