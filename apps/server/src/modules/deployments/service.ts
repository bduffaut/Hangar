import {
  canTransition,
  type DeploymentStatus,
  type DeploymentTrigger,
  isTerminal,
} from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { notFound, UserError } from '../../errors.ts'
import { type Project, updateProject } from '../projects/repo.ts'
import { getGithubToken } from '../settings/secrets.ts'
import {
  type Deployment,
  type DeploymentPatch,
  getDeployment,
  insertQueuedDeployment,
  listDeployments,
  markDeploymentLive,
  type NewDeployment,
  updateDeploymentStatus,
} from './repo.ts'

export class DeploymentError extends UserError {
  constructor(message: string) {
    super(409, 'deployment_conflict', message)
  }
}

async function publishStatus(
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

/** deploying → ready, and the deployment becomes the project's live one, atomically. */
export async function goLive(ctx: Ctx, deployment: Deployment) {
  const outcome = await markDeploymentLive(ctx.db, deployment)
  if (outcome === 'live') await publishStatus(ctx, { ...deployment, status: 'ready' })
  return outcome
}

/**
 * Sends the worker job for a queued deployment. Sending twice is harmless: the worker only runs a
 * deployment it can move out of `queued`, which happens once.
 */
export async function sendJob(ctx: Ctx, deployment: Pick<Deployment, 'id' | 'trigger'>) {
  const queue = deployment.trigger === 'rollback' ? 'deploy' : 'build'
  await ctx.queue.send(queue, { deploymentId: deployment.id })
}

/** Inserts a queued deployment (superseding any still waiting), announces it, and sends its job. */
async function enqueue(ctx: Ctx, values: NewDeployment): Promise<Deployment> {
  const { deployment, superseded } = await insertQueuedDeployment(ctx.db, values)
  // The poller compares the branch head with this, so a manual or webhook deploy is not repeated.
  if (values.trigger !== 'rollback') {
    await updateProject(ctx.db, values.projectId, { lastSeenSha: values.commitSha })
  }
  for (const id of superseded) {
    await publishStatus(ctx, { id, projectId: values.projectId, status: 'cancelled' })
  }
  await publishStatus(ctx, deployment)
  await sendJob(ctx, deployment)
  return deployment
}

/** Queues a build of `commitSha`. A deployment still waiting for the same project is superseded. */
export async function queueDeployment(
  ctx: Ctx,
  project: Project,
  options: { commitSha: string; trigger: Exclude<DeploymentTrigger, 'rollback'> },
): Promise<Deployment> {
  return enqueue(ctx, {
    projectId: project.id,
    commitSha: options.commitSha,
    branch: project.branch,
    trigger: options.trigger,
  })
}

/** Queues a build of the tip of the project's branch. */
export async function queueBranchHead(
  ctx: Ctx,
  project: Project,
  trigger: Exclude<DeploymentTrigger, 'rollback'>,
): Promise<Deployment> {
  const sha = await ctx.git.headOf(project.repoUrl, project.branch, await getGithubToken(ctx))
  if (!sha)
    throw new DeploymentError(`Branch "${project.branch}" was not found in ${project.repoUrl}`)
  return queueDeployment(ctx, project, { commitSha: sha, trigger })
}

/** Queues a redeploy of an earlier ready deployment's image, without rebuilding. */
export async function queueRollback(ctx: Ctx, source: Deployment): Promise<Deployment> {
  if (source.status !== 'ready' || !source.imageTag) {
    throw new DeploymentError('Only a deployment that went live can be rolled back to')
  }
  return enqueue(ctx, {
    projectId: source.projectId,
    commitSha: source.commitSha,
    commitMessage: source.commitMessage,
    commitAuthor: source.commitAuthor,
    branch: source.branch,
    imageTag: source.imageTag,
    trigger: 'rollback',
    sourceDeploymentId: source.id,
  })
}

/**
 * A queued deployment is cancelled directly. A building one is cancelled by the worker running it,
 * which kills the build. Once a deployment is deploying it can no longer be cancelled.
 */
export async function requestCancel(ctx: Ctx, deploymentId: string): Promise<void> {
  const deployment = await getDeployment(ctx.db, deploymentId)
  if (!deployment) throw notFound('Deployment')
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

/** Cancels the project's deployment that is waiting or building. Returns it. */
export async function cancelActive(ctx: Ctx, project: Project): Promise<Deployment> {
  // At most one deployment per project is queued and one in progress, so the newest few suffice.
  const active = (await listDeployments(ctx.db, project.id, 5)).find((d) => !isTerminal(d.status))
  if (!active) throw new DeploymentError(`${project.name} has nothing to cancel`)
  await requestCancel(ctx, active.id)
  return active
}
