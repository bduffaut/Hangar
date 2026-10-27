import { CONTAINER_STOP_GRACE_SECONDS, DEFAULT_APP_PORT } from '@hangar/shared'
import type { Ctx } from '../context.ts'
import { updateDeployment } from '../modules/deployments/repo.ts'
import { listCurrentDeployments, listProjectRoutes } from '../modules/projects/repo.ts'
import { getSettings } from '../modules/settings/repo.ts'
import { appContainerName } from '../platform/names.ts'
import { renderRouting, type AppRoute } from '../platform/proxy.ts'
import { startAppContainer } from './app-container.ts'

/** Routes to use instead of the database's, for a deployment that is about to become current. */
export type RouteOverrides = Record<string, { deploymentNumber: number; port: number }>

/** Rewrites Traefik's routing file from the database. Safe to call at any time. */
export async function syncRouting(ctx: Ctx, overrides: RouteOverrides = {}): Promise<void> {
  const settings = await getSettings(ctx.db)
  if (!settings.lanIp || !settings.lanDomain) {
    ctx.log.warn('No LAN address configured yet (HANGAR_LAN_IP); routing is not written')
    return
  }

  const apps: AppRoute[] = (await listProjectRoutes(ctx.db)).map((row) => {
    const override = overrides[row.name]
    if (override) {
      return {
        name: row.name,
        target: {
          host: appContainerName(row.name, override.deploymentNumber),
          port: override.port,
        },
      }
    }
    return {
      name: row.name,
      target:
        row.desiredState === 'running' && row.deploymentNumber !== null && row.port !== null
          ? { host: appContainerName(row.name, row.deploymentNumber), port: row.port }
          : null,
    }
  })

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

/**
 * Converges Docker and Traefik to the database: each project's current deployment runs (or is
 * stopped) as desired, recreated from its image if the container is gone. Idempotent.
 */
export async function reconcile(ctx: Ctx): Promise<void> {
  for (const { project, deployment } of await listCurrentDeployments(ctx.db)) {
    const name = appContainerName(project.name, deployment.number)
    const state = await ctx.docker.containerState(name)
    try {
      if (project.desiredState === 'stopped') {
        if (state?.running) await ctx.docker.stopContainer(name, CONTAINER_STOP_GRACE_SECONDS)
        continue
      }
      if (state && !state.running && !state.restarting) {
        await ctx.docker.startContainer(name)
        ctx.log.info({ container: name }, 'Started stopped app container')
      } else if (!state) {
        if (!deployment.imageTag || !(await ctx.docker.imageExists(deployment.imageTag))) {
          ctx.log.error({ project: project.name }, 'Current deployment image is missing')
          continue
        }
        const port = deployment.port ?? DEFAULT_APP_PORT
        const { id } = await startAppContainer(ctx, project, deployment, deployment.imageTag, port)
        await updateDeployment(ctx.db, deployment.id, { containerId: id })
        ctx.log.info({ container: name }, 'Recreated missing app container')
      }
    } catch (error) {
      ctx.log.error({ err: error, project: project.name }, 'Could not reconcile app container')
    }
  }
  await syncRouting(ctx)
}
