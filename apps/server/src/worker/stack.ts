import { createHash } from 'node:crypto'
import {
  type CatalogService,
  CONTAINER_STOP_GRACE_SECONDS,
  serviceEnv,
  serviceImage,
} from '@hangar/shared'
import type { Ctx } from '../context.ts'
import { findTemplate } from '../modules/catalog/templates.ts'
import { getEnv } from '../modules/env-vars/service.ts'
import type { Project } from '../modules/projects/repo.ts'
import { resolveMounts } from '../modules/storage/service.ts'
import { serviceContainerName, stackNetworkName } from '../platform/names.ts'

// Stacks (D44): an app with supporting containers (a database, a cache, a worker) from its catalog
// template. The services run on a private network of their own that only the app also joins, so
// no other app can reach them, and they are never routed. The app's own container is deployed by
// the pipeline exactly as for any image app; this file only keeps its services up.

/** How long a service may take to report healthy (a first database start initializes its files). */
const SERVICE_READY_TIMEOUT_MS = 3 * 60_000
/** A service without a health check counts as ready once it has stayed up this long. */
const SERVICE_SETTLE_MS = 3_000
const POLL_MS = 1_000

export class StackError extends Error {}

/** The services of an app's template, in start order; none for apps that are not stacks. */
export function stackServices(ctx: Ctx, project: Project): CatalogService[] {
  if (project.kind !== 'image' || !project.catalogId || !project.image) return []
  return findTemplate(ctx, project.catalogId)?.services ?? []
}

/** Pulls the services' images that are not on the computer yet (part of a deploy's pull step). */
export async function pullStackImages(
  ctx: Ctx,
  project: Project,
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  for (const service of stackServices(ctx, project)) {
    const image = serviceImage(service, project.image!)
    if (await ctx.docker.imageExists(image)) continue
    onLine(`Pulling ${image} for ${service.name}`)
    await ctx.docker.pullImage(image, onLine, signal)
  }
}

/**
 * Brings an app's services up in order, each healthy before the next starts, and returns the
 * stack network for the app to join (null for an app without services). A service already running
 * as specified is left alone; one whose image or settings changed is replaced. Its data lives in
 * its kept folders, so replacing it loses nothing.
 */
export async function ensureStack(
  ctx: Ctx,
  project: Project,
  log: (line: string) => void = () => {},
): Promise<string | null> {
  const services = stackServices(ctx, project)
  if (services.length === 0) return null
  const network = stackNetworkName(project.id)
  await ctx.docker.ensureStackNetwork(network, project.id)
  const appEnv = await getEnv(ctx, project.id)
  for (const service of services) {
    const name = serviceContainerName(project.name, service.name)
    const image = serviceImage(service, project.image!)
    const env = serviceEnv(service, appEnv)
    const mounts = await resolveMounts(ctx, project, service.name)
    const specHash = createHash('sha256')
      .update(
        JSON.stringify([
          image,
          env,
          mounts,
          service.memoryLimitMb,
          service.healthCommand ?? null,
          service.shmSizeMb ?? null,
        ]),
      )
      .digest('hex')
      .slice(0, 16)

    const state = await ctx.docker.serviceState(name)
    if (state?.specHash === specHash) {
      if (state.running && state.health !== 'unhealthy' && state.health !== 'starting') continue
      if (!state.running) {
        log(`Starting ${service.name}`)
        await ctx.docker.startContainer(name)
      }
    } else {
      if (state) {
        log(`Replacing ${service.name}: its image or settings changed`)
        await ctx.docker.removeContainer(name, CONTAINER_STOP_GRACE_SECONDS)
      }
      log(`Starting ${service.name} (${image})`)
      await ctx.docker.ensureImage(image)
      await ctx.docker.runService({
        name,
        image,
        projectId: project.id,
        service: service.name,
        specHash,
        env,
        memoryLimitMb: service.memoryLimitMb,
        network,
        mounts,
        ...(service.healthCommand ? { healthCommand: service.healthCommand } : {}),
        ...(service.shmSizeMb ? { shmSizeMb: service.shmSizeMb } : {}),
      })
    }
    await waitUntilReady(ctx, name, service.name)
    log(`${service.name} is ready`)
  }
  return network
}

/** Waits for a service to report healthy, or to stay up when it has no health check. */
async function waitUntilReady(ctx: Ctx, name: string, service: string): Promise<void> {
  const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS
  let upSince: number | null = null
  let downChecks = 0
  while (Date.now() < deadline) {
    const state = await ctx.docker.serviceState(name)
    // Down on two checks in a row: it exited (one check may catch a restart in progress).
    downChecks = state?.running ? 0 : downChecks + 1
    if (!state || downChecks >= 2) {
      const tail = state ? await ctx.docker.containerLogTail(name, 20).catch(() => []) : []
      throw new StackError(
        `${service} stopped while starting${tail.length ? `. Its last lines:\n${tail.join('\n')}` : ''}`,
      )
    }
    if (state.health === 'healthy') return
    if (state.health === 'unhealthy') throw new StackError(`${service} reports itself unhealthy`)
    if (state.running && state.health === 'none') {
      upSince ??= Date.now()
      if (Date.now() - upSince >= SERVICE_SETTLE_MS) return
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new StackError(`${service} did not become ready within 3 minutes`)
}

/** Stops an app's services, for a stopped app. Their containers and data stay. */
export async function stopStack(ctx: Ctx, project: Project): Promise<void> {
  if (stackServices(ctx, project).length === 0) return
  for (const container of await ctx.docker.listManagedServices(project.id)) {
    if (container.running)
      await ctx.docker.stopContainer(container.id, CONTAINER_STOP_GRACE_SECONDS)
  }
}

/** Removes an app's service containers and its stack network (its kept folders stay). */
export async function removeStack(ctx: Ctx, projectId: string): Promise<void> {
  // An empty id would match every stack's services.
  if (!projectId) throw new Error('removeStack needs a project id')
  for (const container of await ctx.docker.listManagedServices(projectId)) {
    await ctx.docker.removeContainer(container.id, CONTAINER_STOP_GRACE_SECONDS)
  }
  await ctx.docker.removeAppNetwork(stackNetworkName(projectId))
}
