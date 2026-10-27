import { existsSync } from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'
import type { Http } from './server.ts'

/**
 * Locks the dashboard down to its own code: no inline scripts, no third-party requests, no
 * framing. Inline styles are allowed because the component library and theme inject <style> tags.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  // Small fonts are inlined into the stylesheet as data: URLs by the build.
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** Headers on every response from core. */
export function addSecurityHeaders(app: FastifyInstance) {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'same-origin')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  })
}

/**
 * Serves the built Control Tower on tower hostnames (the request gates keep it there). Files are
 * looked up per request, so a dashboard built after startup, or rebuilt, is served without a
 * restart. Hashed assets are cached for a year; everything else is revalidated.
 */
export async function serveDashboard(http: Http) {
  const { app, ctx } = http
  const root = path.resolve(ctx.config.webDir)
  if (!existsSync(path.join(root, 'index.html'))) {
    ctx.log.info({ webDir: root }, 'No built Control Tower yet; it is served once it exists')
  }
  await app.register(fastifyStatic, {
    root,
    index: ['index.html'],
    serveDotFiles: false,
    setHeaders(res, filePath) {
      res.header(
        'Cache-Control',
        filePath.includes(`${path.sep}assets${path.sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      )
    },
  })
  http.enableDashboardFallback(() => existsSync(path.join(root, 'index.html')))
}
