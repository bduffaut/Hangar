import { contract, isTerminal, type LogLineView, schemas, streams } from '@hangar/shared'
import { z } from 'zod'
import { eventStream, type Http, OK, parseInput, route } from '../../http/server.ts'
import { getProjectOrThrow } from '../projects/service.ts'
import {
  deploymentViewOf as viewOf,
  findDeployment,
  getDeploymentOrThrow,
  listActiveDeployments,
  listProjectDeployments,
  logsAfter,
  queueRollback,
  requestCancel,
} from './service.ts'
import { deploymentView } from './views.ts'

const logView = (row: Awaited<ReturnType<typeof logsAfter>>[number]): LogLineView => ({
  ...row,
  ts: row.ts.toISOString(),
})

export function deploymentRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.listDeployments, async ({ params, query }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    const rows = await listProjectDeployments(ctx, project.id, query.limit)
    return rows.map((d) => deploymentView(d, project.currentDeploymentId))
  })

  route(http, contract.getDeployment, async ({ params }) =>
    viewOf(ctx, await getDeploymentOrThrow(ctx, params.id)),
  )

  route(http, contract.deploymentLogs, async ({ params, query }) => {
    await getDeploymentOrThrow(ctx, params.id)
    return (await logsAfter(ctx, params.id, query.after)).map(logView)
  })

  route(http, contract.cancelDeployment, async ({ params }) => {
    await requestCancel(ctx, params.id)
    return OK
  })

  route(http, contract.rollbackDeployment, async ({ params }) => {
    const source = await getDeploymentOrThrow(ctx, params.id)
    return viewOf(ctx, await queueRollback(ctx, source))
  })

  // Every deployment status change, starting with a snapshot of the ones in progress.
  eventStream(
    http,
    streams.events,
    z.object({}),
    async () => null,
    async (stream) => {
      // Subscribe before taking the snapshot, and hold events until it is sent, so a change in
      // between is neither lost nor delivered ahead of the snapshot.
      let pending: string[] | null = []
      const unsubscribe = await ctx.events.subscribe('deployment_status', (event) => {
        if (pending) pending.push(event.deploymentId)
        else sendStatus(event.deploymentId)
      })
      stream.onClose(unsubscribe)
      const active = await listActiveDeployments(ctx)
      stream.send('snapshot', {
        deployments: await Promise.all(active.map((d) => viewOf(ctx, d))),
      })
      const buffered = pending
      pending = null
      for (const id of buffered) sendStatus(id)

      function sendStatus(deploymentId: string) {
        void findDeployment(ctx, deploymentId)
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
      }
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
      const after = parseInput(schemas.logsQuery, request.query).after
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
            const deployment = await findDeployment(ctx, id)
            for (const row of await logsAfter(ctx, id, lastSeq)) {
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
