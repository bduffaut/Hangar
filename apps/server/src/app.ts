import Fastify, { type FastifyBaseLogger } from 'fastify'
import type { Ctx } from './context.ts'
import { systemRoutes } from './modules/system/routes.ts'

export function buildApp(ctx: Ctx) {
  // Typed as Fastify's base logger so route modules can take a plain FastifyInstance.
  const app = Fastify({ loggerInstance: ctx.log as FastifyBaseLogger })
  systemRoutes(app, ctx)
  return app
}
