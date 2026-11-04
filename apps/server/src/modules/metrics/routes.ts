import { type MetricsSample, streams } from '@hangar/shared'
import { z } from 'zod'
import { eventStream, type Http } from '../../http/server.ts'
import { listProjectsOf } from '../projects/repo.ts'
import { createMetricsSampler } from './service.ts'

export function metricsRoutes(http: Http) {
  const { ctx } = http
  const sampler = createMetricsSampler(ctx)

  eventStream(
    http,
    streams.metrics,
    z.object({}),
    async (_params, request) => request.auth!.user,
    async (stream, user) => {
      // Each viewer sees their own apps; the server's readings are for admins.
      const viewOf = async (samples: MetricsSample[]) => {
        const mine = new Set((await listProjectsOf(ctx.db, user.id)).map((p) => p.id))
        return samples.map((sample) => ({
          ...sample,
          host: user.role === 'admin' ? sample.host : null,
          containers: sample.containers.filter((c) => mine.has(c.projectId)),
        }))
      }
      stream.send('history', { samples: await viewOf(sampler.history()) })
      stream.onClose(
        sampler.subscribe((sample) => {
          void viewOf([sample])
            .then(([view]) => stream.send('sample', view))
            .catch((error: unknown) => ctx.log.warn({ err: error }, 'Could not send a sample'))
        }),
      )
    },
  )
}
