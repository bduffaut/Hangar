import type { Ctx } from '../context.ts'
import { listDeploymentsByStatus } from '../modules/deployments/repo.ts'
import { sendJob, transition } from '../modules/deployments/service.ts'
import { listCurrentDeployments } from '../modules/projects/repo.ts'
import { collectGarbage, sweepBuildDirs } from './gc.ts'
import { ABORT_CANCEL, ABORT_SHUTDOWN, runDeployment } from './pipeline.ts'
import { pollProjects } from './poller.ts'
import { reconcile } from './reconciler.ts'

const SHUTDOWN_WAIT_MS = 5_000

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

  await sweepBuildDirs(ctx)
  await reconcile(ctx)

  for (const deployment of await listDeploymentsByStatus(ctx.db, ['queued'])) {
    await sendJob(ctx, deployment)
  }
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
  await ctx.queue.schedule('gc', '17 * * * *')
  await ctx.queue.schedule('poll', '* * * * *')
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
