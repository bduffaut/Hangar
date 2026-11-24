import type { Ctx } from '../context.ts'
import type { Deployment } from '../modules/deployments/repo.ts'
import { getEnv } from '../modules/env-vars/service.ts'
import type { Project } from '../modules/projects/repo.ts'
import { resolveMounts } from '../modules/storage/service.ts'
import { appContainerName, ownerNetworkName } from '../platform/names.ts'
import { ensureStack } from './stack.ts'
import { addressEnvValue } from '@hangar/shared'
import { findTemplate } from '../modules/catalog/templates.ts'

/** Makes sure an account's network exists, with Traefik and core attached to reach its apps. */
export async function ensureOwnerNetwork(ctx: Ctx, ownerId: string): Promise<string> {
  const network = ownerNetworkName(ownerId)
  const peers = [ctx.config.proxyHost, new URL(ctx.config.coreUrl).hostname]
  await ctx.docker.ensureAppNetwork(network, ownerId, peers)
  return network
}

/**
 * Starts the container for a deployment with the project's env vars (current ones unless given),
 * `PORT`, memory limit, storage, libraries, the graphics chip if granted, and managed labels. It
 * is not routed until the routing file says so. A stack's services (D44) are brought up first,
 * and the container joins their private network.
 */
export async function startAppContainer(
  ctx: Ctx,
  project: Project,
  deployment: Pick<Deployment, 'id' | 'number'>,
  image: string,
  port: number,
  env?: Record<string, string>,
  log?: (line: string) => void,
): Promise<{ name: string; id: string }> {
  const name = appContainerName(project.name, deployment.number)
  env ??= await getEnv(ctx, project.id)
  // An app that must be told its own public addresses (D48).
  const addressEnv = project.catalogId
    ? findTemplate(ctx, project.catalogId)?.addressEnv
    : undefined
  if (addressEnv && project.hostnames.length) {
    env = { ...env, [addressEnv]: addressEnvValue(env[addressEnv], project.hostnames) }
  }
  const network = await ensureOwnerNetwork(ctx, project.ownerId)
  const mounts = await resolveMounts(ctx, project)
  const stackNetwork = await ensureStack(ctx, project, log)
  const id = await ctx.docker.runApp({
    name,
    image,
    projectId: project.id,
    deploymentId: deployment.id,
    env: { ...env, PORT: String(port) },
    memoryLimitMb: project.memoryLimitMb,
    network,
    mounts,
    gpu: project.gpu,
    ...(stackNetwork ? { extraNetworks: [stackNetwork] } : {}),
  })
  return { name, id }
}
