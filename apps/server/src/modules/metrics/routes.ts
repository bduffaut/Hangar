import { streams } from '@hangar/shared'
import { z } from 'zod'
import { eventStream, type Http } from '../../http/server.ts'
import { createMetricsSampler } from './service.ts'

export function metricsRoutes(http: Http) {
  const sampler = createMetricsSampler(http.ctx)

  eventStream(
    http,
    streams.metrics,
    z.object({}),
    async () => null,
    async (stream) => {
      stream.send('history', { samples: sampler.history() })
      stream.onClose(sampler.subscribe((sample) => stream.send('sample', sample)))
    },
  )
}
