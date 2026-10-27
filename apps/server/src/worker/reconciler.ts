import { CONTAINER_STOP_GRACE_SECONDS, DEFAULT_APP_PORT } from '@hangar/shared'
import { createHash } from 'node:crypto'
import type { Ctx } from '../context.ts'
import { projectLockKey, withAdvisoryLock } from '../db/lock.ts'
import { updateDeployment } from '../modules/deployments/repo.ts'
import { listCurrentDeployments, listProjectRoutes } from '../modules/projects/repo.ts'
import { getSettings } from '../modules/settings/repo.ts'
import { getTunnelToken } from '../modules/settings/secrets.ts'
import { LABELS } from '../platform/docker.ts'
import { appContainerName } from '../platform/names.ts'
import { renderRouting, type AppRoute } from '../platform/proxy.ts'
import { startAppContainer } from './app-container.ts'

// There is one routing file, so every write to it is serialized across processes.
const ROUTING_LOCK = 'routing'

interface RouteTarget {
  deploymentNumber: number
  port: number
}

/** Rewrites Traefik's routing file from the database. Safe to call at any time. */
export async function syncRouting(ctx: Ctx): Promise<void> {
  await withAdvisoryLock(ctx.db, ROUTING_LOCK, () => writeRouting(ctx))
}

/**
 * Routes `projectName` to a new container, then runs `confirm` (wait for Traefik, record the
 * deployment as live) before any other routing write can happen. If `confirm` returns false or
 * throws, routing is restored from the database.
 */
export async function switchRoute(
  ctx: Ctx,
  projectName: string,
  target: RouteTarget,
  confirm: () => Promise<boolean>,
): Promise<boolean> {
  return withAdvisoryLock(ctx.db, ROUTING_LOCK, async () => {
    await writeRouting(ctx, { [projectName]: target })
    let confirmed = false
    try {
      confirmed = await confirm()
      return confirmed
    } finally {
      if (!confirmed) await writeRouting(ctx)
    }
  })
}

async function writeRouting(ctx: Ctx, overrides: Record<string, RouteTarget> = {}): Promise<void> {
  const settings = await getSettings(ctx.db)
  if (!settings.lanIp || !settings.lanDomain) {
    ctx.log.warn('No LAN address configured yet (HANGAR_LAN_IP); routing is not written')
    return
  }

  const apps: AppRoute[] = (await listProjectRoutes(ctx.db)).map((row) => {
    const override = overrides[row.name]
    const number = override?.deploymentNumber ?? row.deploymentNumber
    const port = override?.port ?? row.port
    const running = override !== undefined || row.desiredState === 'running'
    return {
      name: row.name,
      target:
        running && number !== null && port !== null
          ? { host: appContainerName(row.name, number), port }
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
  for (const { project: listed } of await listCurrentDeployments(ctx.db)) {
    try {
      await withAdvisoryLock(ctx.db, projectLockKey(listed.id), () =>
        reconcileProject(ctx, listed.id),
      )
    } catch (error) {
      ctx.log.error({ err: error, project: listed.name }, 'Could not reconcile app container')
    }
  }
  await syncRouting(ctx)
  await ensureTunnel(ctx).catch((error: unknown) => {
    ctx.log.error({ err: error }, 'Could not start the Cloudflare tunnel')
  })
}

/** Converges one project (after start, stop, or a settings change) and the routing file. */
export async function reconcileOne(ctx: Ctx, projectId: string): Promise<void> {
  await withAdvisoryLock(ctx.db, projectLockKey(projectId), () => reconcileProject(ctx, projectId))
  await syncRouting(ctx)
}

// Pinned by digest; upgrade deliberately.
const CLOUDFLARED_IMAGE =
  'cloudflare/cloudflared:2026.9.3@sha256:072c067d25ccbe61d46e18f0d0723255f2bb5304f7317caa95b27031520ff92c'

/**
 * Runs `hangar-tunnel` if and only if a Cloudflare tunnel token is set, recreating it when the
 * token changes. The container is labelled with a hash of the token, never the token itself.
 */
export async function ensureTunnel(ctx: Ctx): Promise<void> {
  const token = await getTunnelToken(ctx)
  const existing = await ctx.docker.listTunnels()
  if (!token) {
    for (const container of existing) await ctx.docker.removeContainer(container.id, 10)
    return
  }
  const tokenHash = createHash('sha256').update(token).digest('hex').slice(0, 16)
  const current = existing.find((c) => c.labels[LABELS.tunnelToken] === tokenHash)
  if (current?.running && existing.length === 1) return
  if (current && existing.length === 1) {
    await ctx.docker.startContainer(current.id)
    return
  }
  for (const container of existing) await ctx.docker.removeContainer(container.id, 10)
  await ctx.docker.ensureImage(CLOUDFLARED_IMAGE)
  await ctx.docker.runTunnel({ image: CLOUDFLARED_IMAGE, token, tokenHash })
  ctx.log.info('Cloudflare tunnel started')
}

/** Call with the project lock held, so the current deployment cannot change underneath. */
async function reconcileProject(ctx: Ctx, projectId: string): Promise<void> {
  const [current] = await listCurrentDeployments(ctx.db, projectId)
  if (!current) return
  const { project, deployment } = current
  const name = appContainerName(project.name, deployment.number)
  const state = await ctx.docker.containerState(name)
  if (project.desiredState === 'stopped') {
    if (state?.running) await ctx.docker.stopContainer(name, CONTAINER_STOP_GRACE_SECONDS)
    return
  }
  if (state && !state.running && !state.restarting) {
    await ctx.docker.startContainer(name)
    ctx.log.info({ container: name }, 'Started stopped app container')
  } else if (!state) {
    if (!deployment.imageTag || !(await ctx.docker.imageExists(deployment.imageTag))) {
      ctx.log.error({ project: project.name }, 'Current deployment image is missing')
      return
    }
    const port = deployment.port ?? DEFAULT_APP_PORT
    const { id } = await startAppContainer(ctx, project, deployment, deployment.imageTag, port)
    await updateDeployment(ctx.db, deployment.id, { containerId: id })
    ctx.log.info({ container: name }, 'Recreated missing app container')
  }
}
