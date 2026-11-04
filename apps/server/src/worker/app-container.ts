import type { Ctx } from '../context.ts'
import type { Deployment } from '../modules/deployments/repo.ts'
import { getEnv } from '../modules/env-vars/service.ts'
import type { Project } from '../modules/projects/repo.ts'
import { appContainerName, ownerNetworkName } from '../platform/names.ts'

/** Makes sure an account's network exists, with Traefik and core attached to reach its apps. */
export async function ensureOwnerNetwork(ctx: Ctx, ownerId: string): Promise<string> {
  const network = ownerNetworkName(ownerId)
  const peers = [ctx.config.proxyHost, new URL(ctx.config.coreUrl).hostname]
  await ctx.docker.ensureAppNetwork(network, ownerId, peers)
  return network
}

/**
 * Starts the container for a deployment with the project's env vars (current ones unless given),
 * `PORT`, memory limit, and managed labels. It is not routed until the routing file says so.
 */
export async function startAppContainer(
  ctx: Ctx,
  project: Project,
  deployment: Pick<Deployment, 'id' | 'number'>,
  image: string,
  port: number,
  env?: Record<string, string>,
): Promise<{ name: string; id: string }> {
  const name = appContainerName(project.name, deployment.number)
  env ??= await getEnv(ctx, project.id)
  const network = await ensureOwnerNetwork(ctx, project.ownerId)
  const id = await ctx.docker.runApp({
    name,
    image,
    projectId: project.id,
    deploymentId: deployment.id,
    env: { ...env, PORT: String(port) },
    memoryLimitMb: project.memoryLimitMb,
    network,
  })
  return { name, id }
}
