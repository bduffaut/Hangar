import type { Ctx } from '../context.ts'
import { refreshAddresses } from '../modules/addresses/service.ts'
import { listDeployments, listDeploymentsByStatus } from '../modules/deployments/repo.ts'
import {
  queueBranchHead,
  queueDeployment,
  sendJob,
  transition,
} from '../modules/deployments/service.ts'
import { listCurrentDeployments, listProjects } from '../modules/projects/repo.ts'
import { collectGarbage, sweepBuildDirs } from './gc.ts'
import { ABORT_CANCEL, ABORT_SHUTDOWN, runDeployment } from './pipeline.ts'
import { pollProjects } from './poller.ts'
import { reconcile, reconnectOwnerNetworks } from './reconciler.ts'
import { removeStack } from './stack.ts'

const SHUTDOWN_WAIT_MS = 5_000
/** A deploy that a restart cut short this recently is tried again when Hangar starts. */
const RETRY_INTERRUPTED_MS = 15 * 60_000

/**
 * Tries again, once, each app's newest deployment that a restart cut short (an update of Hangar,
 * a reboot). Without this, a commit the poller had already seen would wait for the next one. A
 * retry that was itself cut short is left alone, so restarts in a loop never rebuild forever, and
 * rollbacks are not repeated.
 */
export async function retryInterrupted(ctx: Ctx): Promise<void> {
  const since = Date.now() - RETRY_INTERRUPTED_MS
  for (const project of await listProjects(ctx.db)) {
    if (project.desiredState !== 'running') continue
    const [latest, previous] = await listDeployments(ctx.db, project.id, 2)
    if (!latest || latest.failureCode !== 'interrupted' || latest.trigger === 'rollback') continue
    if (!latest.finishedAt || latest.finishedAt.getTime() < since) continue
    if (previous?.failureCode === 'interrupted' && previous.commitSha === latest.commitSha) continue
    const retry =
      project.kind === 'image'
        ? await queueBranchHead(ctx, project, latest.trigger)
        : await queueDeployment(ctx, project, {
            commitSha: latest.commitSha,
            trigger: latest.trigger,
          })
    ctx.log.info(
      { project: project.name, interrupted: latest.number, retry: retry.number },
      'Trying an interrupted deployment again',
    )
  }
}

/**
 * After a crash or restart: fail whatever was mid-flight, remove containers that are not live,
 * converge Docker and Traefik to the database, and make sure queued deployments have a job.
 */
export async function recover(ctx: Ctx): Promise<void> {
  for (const deployment of await listDeploymentsByStatus(ctx.db, ['building', 'deploying'])) {
    await transition(ctx, deployment.id, deployment.status, 'failed', {
      failureCode: 'interrupted',
      failureReason: 'Hangar restarted while this deployment was in progress',
      finishedAt: new Date(),
    })
    ctx.log.warn({ deploymentId: deployment.id }, 'Marked interrupted deployment as failed')
  }

  const live = new Set((await listCurrentDeployments(ctx.db)).map((row) => row.deployment.id))
  for (const container of await ctx.docker.listManagedApps()) {
    if (container.deploymentId && live.has(container.deploymentId)) continue
    await ctx.docker.removeContainer(container.id)
    ctx.log.info({ container: container.name }, 'Removed leftover app container')
  }
  // Stack services (D44) of apps that no longer exist.
  const projectIds = new Set((await listProjects(ctx.db)).map((p) => p.id))
  for (const container of await ctx.docker.listManagedServices()) {
    if (container.projectId && projectIds.has(container.projectId)) continue
    if (container.projectId) await removeStack(ctx, container.projectId)
    else await ctx.docker.removeContainer(container.id)
    ctx.log.info({ container: container.name }, 'Removed a leftover stack service')
  }

  await sweepBuildDirs(ctx)
  await reconcile(ctx)

  for (const deployment of await listDeploymentsByStatus(ctx.db, ['queued'])) {
    await sendJob(ctx, deployment)
  }
  await retryInterrupted(ctx)
}

/** Recovers, then starts handling jobs. Returns a function that stops in-flight work. */
export async function startWorker(ctx: Ctx): Promise<{ stop: () => Promise<void> }> {
  await recover(ctx)

  const running = new Map<string, { controller: AbortController; done: Promise<void> }>()
  await ctx.events.subscribe('deployment_cancel', ({ deploymentId }) => {
    running.get(deploymentId)?.controller.abort(ABORT_CANCEL)
  })

  const handleDeployment = async ({ deploymentId }: { deploymentId: string }) => {
    const controller = new AbortController()
    const done = runDeployment(ctx, deploymentId, controller.signal)
    running.set(deploymentId, { controller, done })
    try {
      await done
    } finally {
      running.delete(deploymentId)
    }
  }

  await ctx.queue.work('build', handleDeployment)
  await ctx.queue.work('deploy', handleDeployment)
  await ctx.queue.work('gc', () => collectGarbage(ctx))
  await ctx.queue.work('reconcile', () => reconcile(ctx))
  await ctx.queue.work('poll', () => pollProjects(ctx))
  await ctx.queue.work('addresses', async ({ projectId }) => {
    await reconnectOwnerNetworks(ctx)
    await refreshAddresses(ctx, projectId)
  })
  await ctx.queue.schedule('gc', '17 * * * *')
  await ctx.queue.schedule('poll', '* * * * *')
  await ctx.queue.schedule('addresses', '* * * * *')
  ctx.log.info('Worker started')

  return {
    async stop() {
      await ctx.queue.stopWorking()
      const inFlight = [...running.values()]
      for (const { controller } of inFlight) controller.abort(ABORT_SHUTDOWN)
      const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS))
      await Promise.race([Promise.allSettled(inFlight.map((job) => job.done)), timeout])
    },
  }
}
