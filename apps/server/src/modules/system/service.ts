import { sql } from 'drizzle-orm'
import type { Ctx } from '../../context.ts'

/** Answers only when the database does, so Docker's health check notices a lost connection. */
export async function health(ctx: Ctx) {
  await ctx.db.execute(sql`select 1`)
  return { status: 'ok' as const, version: ctx.config.version }
}

export async function systemInfo(ctx: Ctx) {
  return { version: ctx.config.version, imageDiskBytes: await ctx.docker.imageDiskUsage() }
}
