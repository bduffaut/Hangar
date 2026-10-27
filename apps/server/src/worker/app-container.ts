import type { Ctx } from '../context.ts'
import type { Deployment } from '../modules/deployments/repo.ts'
import { getEnv } from '../modules/env-vars/service.ts'
import type { Project } from '../modules/projects/repo.ts'
import { appContainerName } from '../platform/names.ts'

/**
 * Starts the container for a deployment with the project's current env vars, `PORT`, memory
 * limit, and managed labels. It is not routed until the routing file says so.
 */
export async function startAppContainer(
  ctx: Ctx,
  project: Project,
  deployment: Pick<Deployment, 'id' | 'number'>,
  image: string,
  port: number,
): Promise<{ name: string; id: string }> {
  const name = appContainerName(project.name, deployment.number)
  const env = await getEnv(ctx, project.id)
  const id = await ctx.docker.runApp({
    name,
    image,
    projectId: project.id,
    deploymentId: deployment.id,
    env: { ...env, PORT: String(port) },
    memoryLimitMb: project.memoryLimitMb,
  })
  return { name, id }
}
