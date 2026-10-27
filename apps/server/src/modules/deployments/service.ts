import { canTransition, type DeploymentStatus, type DeploymentTrigger } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import type { Project } from '../projects/repo.ts'
import {
  type Deployment,
  type DeploymentPatch,
  getDeployment,
  insertQueuedDeployment,
  updateDeploymentStatus,
} from './repo.ts'

export class DeploymentError extends Error {}

export async function publishStatus(
  ctx: Ctx,
  deployment: Pick<Deployment, 'id' | 'projectId' | 'status'>,
) {
  await ctx.events.publish('deployment_status', {
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    status: deployment.status,
  })
}

/** Every status change goes through here so it is checked, conditional, and announced. */
export async function transition(
  ctx: Ctx,
  id: string,
  from: DeploymentStatus,
  to: DeploymentStatus,
  patch: DeploymentPatch = {},
): Promise<Deployment | null> {
  if (!canTransition(from, to)) throw new Error(`Invalid deployment transition ${from} → ${to}`)
  const row = await updateDeploymentStatus(ctx.db, id, from, to, patch)
  if (row) await publishStatus(ctx, row)
  return row
}

/** Queues a build of `commitSha`. A deployment still waiting for the same project is superseded. */
export async function queueDeployment(
  ctx: Ctx,
  project: Project,
  options: { commitSha: string; trigger: Exclude<DeploymentTrigger, 'rollback'> },
): Promise<Deployment> {
  const { deployment, superseded } = await insertQueuedDeployment(ctx.db, {
    projectId: project.id,
    commitSha: options.commitSha,
    branch: project.branch,
    trigger: options.trigger,
  })
  for (const id of superseded) {
    await publishStatus(ctx, { id, projectId: project.id, status: 'cancelled' })
  }
  await publishStatus(ctx, deployment)
  await ctx.queue.send('build', { deploymentId: deployment.id }, deployment.id)
  return deployment
}

/** Queues a redeploy of an earlier ready deployment's image, without rebuilding. */
export async function queueRollback(ctx: Ctx, source: Deployment): Promise<Deployment> {
  if (source.status !== 'ready' || !source.imageTag) {
    throw new DeploymentError('Only a deployment that went live can be rolled back to')
  }
  const { deployment, superseded } = await insertQueuedDeployment(ctx.db, {
    projectId: source.projectId,
    commitSha: source.commitSha,
    commitMessage: source.commitMessage,
    commitAuthor: source.commitAuthor,
    branch: source.branch,
    imageTag: source.imageTag,
    trigger: 'rollback',
    sourceDeploymentId: source.id,
  })
  for (const id of superseded) {
    await publishStatus(ctx, { id, projectId: source.projectId, status: 'cancelled' })
  }
  await publishStatus(ctx, deployment)
  await ctx.queue.send('deploy', { deploymentId: deployment.id }, deployment.id)
  return deployment
}

/**
 * A queued deployment is cancelled directly. A building one is cancelled by the worker running it,
 * which kills the build. Once a deployment is deploying it can no longer be cancelled.
 */
export async function requestCancel(ctx: Ctx, deploymentId: string): Promise<void> {
  const deployment = await getDeployment(ctx.db, deploymentId)
  if (!deployment) throw new DeploymentError('Deployment not found')
  if (deployment.status === 'queued') {
    const row = await transition(ctx, deploymentId, 'queued', 'cancelled', {
      failureCode: 'cancelled_by_user',
      finishedAt: new Date(),
    })
    if (row) return
  }
  if (deployment.status === 'queued' || deployment.status === 'building') {
    await ctx.events.publish('deployment_cancel', { deploymentId })
    return
  }
  throw new DeploymentError(`A ${deployment.status} deployment cannot be cancelled`)
}
