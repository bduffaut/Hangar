import type { Ctx } from '../context.ts'
import type { Deployment } from '../modules/deployments/repo.ts'
import { getEnv } from '../modules/env-vars/service.ts'
import type { Project } from '../modules/projects/repo.ts'
import { dataVolumeName, resolveMounts } from '../modules/storage/service.ts'
import { appAlias, appContainerName, ownerNetworkName } from '../platform/names.ts'
import { ensureStack } from './stack.ts'
import { addressEnvValue, isTemplateFilePath } from '@hangar/shared'
import { writeFileIfMissing } from '../platform/host.ts'
import { findTemplate } from '../modules/catalog/templates.ts'
import { listAppPorts } from '../modules/ports/repo.ts'
import { portHost, portInUseMessage } from '../modules/ports/service.ts'

/**
 * Where Traefik and core reach a deployment's container: its name on the account's network, or,
 * for an app on the computer's own network (D54), that network's gateway, which is the computer.
 */
export async function upstreamHost(
  ctx: Ctx,
  project: { name: string; ownerId: string; hostNetwork: boolean },
  deploymentNumber: number,
): Promise<string> {
  if (!project.hostNetwork) return appContainerName(project.name, deploymentNumber)
  const gateway = await ctx.docker.networkGateway(ownerNetworkName(project.ownerId))
  if (!gateway) throw new Error('Could not find the computer’s address on the app network')
  return gateway
}

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
  // A template's starting files (D53), into kept folders the app still has, only when missing.
  const template = project.catalogId ? findTemplate(ctx, project.catalogId) : null
  for (const file of template?.files ?? []) {
    const volume = dataVolumeName(project.name, file.volume)
    if (!isTemplateFilePath(file.path) || !mounts.some((m) => m.source === volume)) continue
    if (await writeFileIfMissing(ctx, volume, file.path, file.content)) {
      log?.(`Wrote ${file.path} into ${file.volume}, the starting settings for ${template!.name}`)
    }
  }
  const stackNetwork = await ensureStack(ctx, project, log)
  const alias = appAlias(project.name)
  // Ports that are not web pages (D51), on the Tailscale address only.
  const ports = await listAppPorts(ctx.db, [project.id])
  const { ip } = ports.length ? await portHost(ctx) : { ip: null }
  if (ports.length && !ip) {
    throw new Error(
      'This app publishes ports, but Hangar does not know this computer’s Tailscale address (HANGAR_LAN_IP). Run sudo hangar-tailscale.',
    )
  }
  const spec = {
    name,
    // Other apps of the account reach it by its name (D50).
    ...(alias ? { aliases: [alias] } : {}),
    ...(ports.length ? { ports: ports.map((p) => ({ ...p, hostIp: ip! })) } : {}),
    ...(project.hostNetwork ? { hostNetwork: true } : {}),
    image,
    projectId: project.id,
    deploymentId: deployment.id,
    env: { ...env, PORT: String(port) },
    memoryLimitMb: project.memoryLimitMb,
    network,
    mounts,
    gpu: project.gpu,
    ...(stackNetwork ? { extraNetworks: [stackNetwork] } : {}),
  }
  const id = await ctx.docker.runApp(spec).catch((error: unknown) => {
    const inUse = portInUseMessage(error, ports)
    throw inUse ? new Error(inUse) : error
  })
  return { name, id }
}
