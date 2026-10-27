import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Ctx } from '../../context.ts'

export function systemRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/health', async () => {
    await ctx.db.execute(sql`select 1`)
    return { status: 'ok', version: ctx.config.version }
  })
}
