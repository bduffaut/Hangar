import { contract } from '@hangar/shared'
import { sql } from 'drizzle-orm'
import { type Http, route } from '../../http/server.ts'

export function systemRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.health, async () => {
    await ctx.db.execute(sql`select 1`)
    return { status: 'ok' as const, version: ctx.config.version }
  })

  route(http, contract.systemInfo, async () => ({
    version: ctx.config.version,
    imageDiskBytes: await ctx.docker.imageDiskUsage(),
  }))
}
