import { contract, isTerminal, type LogLineView, schemas, streams } from '@hangar/shared'
import { z } from 'zod'
import { eventStream, type Http, OK, parseInput, route } from '../../http/server.ts'
import { addressEvent } from '../addresses/service.ts'
import { getProject } from '../projects/repo.ts'
import { ownedProject } from '../projects/service.ts'
import {
  deploymentViewOf as viewOf,
  findDeployment,
  listActiveDeployments,
  listProjectDeployments,
  logsAfter,
  ownedDeployment,
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

  route(http, contract.listDeployments, async ({ auth, params, query }) => {
    const project = await ownedProject(ctx, auth.user.id, params.id)
    const rows = await listProjectDeployments(ctx, project.id, query.limit)
    return rows.map((d) => deploymentView(d, project.currentDeploymentId))
  })

  route(http, contract.getDeployment, async ({ auth, params }) =>
    viewOf(ctx, await ownedDeployment(ctx, auth.user.id, params.id)),
  )

  route(http, contract.deploymentLogs, async ({ auth, params, query }) => {
    await ownedDeployment(ctx, auth.user.id, params.id)
    return (await logsAfter(ctx, params.id, query.after)).map(logView)
  })

  route(http, contract.cancelDeployment, async ({ auth, params }) => {
    await ownedDeployment(ctx, auth.user.id, params.id)
    await requestCancel(ctx, params.id)
    return OK
  })

  route(http, contract.rollbackDeployment, async ({ auth, params }) => {
    const source = await ownedDeployment(ctx, auth.user.id, params.id)
    return viewOf(ctx, await queueRollback(ctx, source))
  })

  // The signed-in user's deployment status changes and address results, starting with a snapshot
  // of the deployments in progress. Events carry only ids; each is checked against the owner
  // before anything is read out, so this stream never shows another account's work.
  eventStream(
    http,
    streams.events,
    z.object({}),
    async (_params, request) => request.auth!.user.id,
    async (stream, userId) => {
      const isMine = async (projectId: string) =>
        (await getProject(ctx.db, projectId))?.ownerId === userId
      // Subscribe before taking the snapshot, and hold events until it is sent, so a change in
      // between is neither lost nor delivered ahead of the snapshot.
      let pending: string[] | null = []
      const unsubscribe = await ctx.events.subscribe('deployment_status', (event) => {
        if (pending) pending.push(event.deploymentId)
        else sendStatus(event.deploymentId)
      })
      stream.onClose(unsubscribe)
      stream.onClose(
        await ctx.events.subscribe('address_status', ({ projectId }) => {
          void isMine(projectId)
            .then(async (mine) => {
              if (mine) stream.send('address', await addressEvent(ctx, projectId))
            })
            .catch((error: unknown) => ctx.log.warn({ err: error }, 'Could not send address event'))
        }),
      )
      const active = await listActiveDeployments(ctx, userId)
      stream.send('snapshot', {
        deployments: await Promise.all(active.map((d) => viewOf(ctx, d))),
      })
      const buffered = pending
      pending = null
      for (const id of buffered) sendStatus(id)

      function sendStatus(deploymentId: string) {
        void findDeployment(ctx, deploymentId)
          .then(async (deployment) => {
            if (!deployment || !(await isMine(deployment.projectId))) return
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
      await ownedDeployment(ctx, request.auth!.user.id, params.id)
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
