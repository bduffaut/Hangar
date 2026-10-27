import {
  ACTIVE_DEPLOYMENT_STATUSES,
  contract,
  isTerminal,
  type LogLineView,
  schemas,
  streams,
} from '@hangar/shared'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { notFound, UserError } from '../../errors.ts'
import { eventStream, type Http, OK, route } from '../../http/server.ts'
import { getProject } from '../projects/repo.ts'
import { getProjectOrThrow } from '../projects/service.ts'
import {
  type Deployment,
  getDeployment,
  listDeployments,
  listDeploymentsByStatus,
  listLogs,
} from './repo.ts'
import { queueRollback, requestCancel } from './service.ts'
import { deploymentView } from './views.ts'

async function getDeploymentOrThrow(ctx: Ctx, id: string): Promise<Deployment> {
  const deployment = await getDeployment(ctx.db, id)
  if (!deployment) throw notFound('Deployment')
  return deployment
}

async function viewOf(ctx: Ctx, deployment: Deployment) {
  const project = await getProject(ctx.db, deployment.projectId)
  return deploymentView(deployment, project?.currentDeploymentId ?? null)
}

const logView = (row: Awaited<ReturnType<typeof listLogs>>[number]): LogLineView => ({
  ...row,
  ts: row.ts.toISOString(),
})

export function deploymentRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.listDeployments, async ({ params, query }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    const rows = await listDeployments(ctx.db, project.id, query.limit)
    return rows.map((d) => deploymentView(d, project.currentDeploymentId))
  })

  route(http, contract.getDeployment, async ({ params }) =>
    viewOf(ctx, await getDeploymentOrThrow(ctx, params.id)),
  )

  route(http, contract.deploymentLogs, async ({ params, query }) => {
    await getDeploymentOrThrow(ctx, params.id)
    return (await listLogs(ctx.db, params.id, query.after)).map(logView)
  })

  route(http, contract.cancelDeployment, async ({ params }) => {
    await requestCancel(ctx, params.id)
    return OK
  })

  route(http, contract.rollbackDeployment, async ({ params }) => {
    const source = await getDeploymentOrThrow(ctx, params.id)
    if (source.imageTag && !(await ctx.docker.imageExists(source.imageTag))) {
      throw new UserError(
        409,
        'image_missing',
        'The image for this deployment has been cleaned up, so it cannot be rolled back to.',
        'Hangar keeps the five most recent successful images per project.',
      )
    }
    return viewOf(ctx, await queueRollback(ctx, source))
  })

  // Every deployment status change, starting with a snapshot of the ones in progress.
  eventStream(
    http,
    streams.events,
    z.object({}),
    async () => null,
    async (stream) => {
      const active = await listDeploymentsByStatus(ctx.db, [...ACTIVE_DEPLOYMENT_STATUSES])
      stream.send('snapshot', {
        deployments: await Promise.all(active.map((d) => viewOf(ctx, d))),
      })
      const unsubscribe = await ctx.events.subscribe('deployment_status', (event) => {
        void getDeployment(ctx.db, event.deploymentId)
          .then(async (deployment) => {
            if (!deployment) return
            stream.send('status', {
              deploymentId: deployment.id,
              projectId: deployment.projectId,
              status: deployment.status,
              deployment: await viewOf(ctx, deployment),
            })
          })
          .catch((error: unknown) => ctx.log.warn({ err: error }, 'Could not send status event'))
      })
      stream.onClose(unsubscribe)
    },
  )

  // The Flight Recorder: replays the build log after Last-Event-ID (or ?after), then follows it.
  // Ends with a `done` event once the deployment has finished.
  eventStream(
    http,
    streams.deploymentLogs,
    schemas.idParams,
    async (params, request) => {
      await getDeploymentOrThrow(ctx, params.id)
      const lastEventId = Number(request.headers['last-event-id'])
      const after = schemas.logsQuery.parse(request.query).after
      return { id: params.id, after: Number.isInteger(lastEventId) ? lastEventId : after }
    },
    async (stream, { id, after }) => {
      let lastSeq = after
      let pumping = false
      let again = false

      // Reads the status before the logs: the pipeline saves every line before the final status,
      // so once a terminal status is seen, the read that follows has the whole log.
      const pump = async () => {
        if (pumping) {
          again = true
          return
        }
        pumping = true
        try {
          do {
            again = false
            const deployment = await getDeployment(ctx.db, id)
            for (const row of await listLogs(ctx.db, id, lastSeq)) {
              stream.send('log', logView(row), row.seq)
              lastSeq = row.seq
            }
            if (!deployment || isTerminal(deployment.status)) {
              stream.send('done', { status: deployment?.status ?? null })
              stream.close()
              return
            }
          } while (again && !stream.closed)
        } finally {
          pumping = false
        }
      }
      const onEvent = (event: { deploymentId: string }) => {
        if (event.deploymentId !== id) return
        pump().catch((error: unknown) => {
          ctx.log.warn({ err: error }, 'Could not stream build log')
          stream.close()
        })
      }
      const unsubscribeLogs = await ctx.events.subscribe('deployment_logs', onEvent)
      const unsubscribeStatus = await ctx.events.subscribe('deployment_status', onEvent)
      stream.onClose(() => {
        unsubscribeLogs()
        unsubscribeStatus()
      })
      await pump()
    },
  )
}
