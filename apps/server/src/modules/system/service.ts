import { sql } from 'drizzle-orm'
import type { Ctx } from '../../context.ts'

/** Answers only when the database does, so Docker's health check notices a lost connection. */
export async function health(ctx: Ctx) {
  await ctx.db.execute(sql`select 1`)
  return { status: 'ok' as const, version: ctx.config.version }
}

export async function systemInfo(ctx: Ctx) {
  const [imageDiskBytes, host] = await Promise.all([
    ctx.docker.imageDiskUsage(),
    ctx.hostMetrics.info(),
  ])
  return { version: ctx.config.version, imageDiskBytes, ...host }
}
