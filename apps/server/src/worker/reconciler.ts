import type { Ctx } from '../context.ts'
import { listProjectRoutes } from '../modules/projects/repo.ts'
import { getSettings } from '../modules/settings/repo.ts'
import { appContainerName } from '../platform/names.ts'
import { renderRouting, type AppRoute } from '../platform/proxy.ts'

/** Rewrites Traefik's routing file from the database. Safe to call at any time. */
export async function syncRouting(ctx: Ctx): Promise<void> {
  const settings = await getSettings(ctx.db)
  if (!settings.lanIp || !settings.lanDomain) {
    ctx.log.warn('No LAN address configured yet (HANGAR_LAN_IP); routing is not written')
    return
  }

  const apps: AppRoute[] = (await listProjectRoutes(ctx.db)).map((row) => ({
    name: row.name,
    target:
      row.desiredState === 'running' && row.deploymentNumber !== null && row.port !== null
        ? { host: appContainerName(row.name, row.deploymentNumber), port: row.port }
        : null,
  }))

  const changed = await ctx.proxy.apply(
    renderRouting({
      lanIp: settings.lanIp,
      lanDomain: settings.lanDomain,
      publicDomain: settings.publicDomain,
      exposeTowerPublicly: settings.exposeTowerPublicly,
      coreUrl: ctx.config.coreUrl,
      apps,
    }),
  )
  if (changed) ctx.log.info({ apps: apps.length }, 'Routing updated')
}
