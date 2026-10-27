import { BUILD_TIMEOUT_MS } from '@hangar/shared'
import { PgBoss } from 'pg-boss'
import type { Logger } from '../logger.ts'

// Jobs carry only IDs. Handlers re-read the database and check status before acting.
export interface JobMap {
  build: { deploymentId: string }
  deploy: { deploymentId: string }
  gc: Record<string, never>
  reconcile: Record<string, never>
}

export type JobName = keyof JobMap

const QUEUE_OPTIONS: Record<JobName, { expireInSeconds: number }> = {
  // The pipeline enforces the 15-minute build limit itself; the margin covers deploy and cleanup.
  build: { expireInSeconds: BUILD_TIMEOUT_MS / 1000 + 300 },
  deploy: { expireInSeconds: 300 },
  gc: { expireInSeconds: 600 },
  reconcile: { expireInSeconds: 300 },
}

export function createQueue(options: { connectionString: string; log: Logger }) {
  const boss = new PgBoss({ connectionString: options.connectionString })
  boss.on('error', (error) => options.log.error({ err: error }, 'Job queue error'))

  let started: Promise<void> | null = null
  const working = new Set<JobName>()

  /** Idempotent; also called by `send` and `work`, so short-lived callers need not call it. */
  function start(): Promise<void> {
    started ??= (async () => {
      await boss.start()
      for (const [name, queueOptions] of Object.entries(QUEUE_OPTIONS)) {
        // A failed pipeline already marked its deployment failed; retrying would only repeat it.
        await boss.createQueue(name, { ...queueOptions, retryLimit: 0 })
      }
    })()
    return started
  }

  return {
    start,

    async send<N extends JobName>(name: N, data: JobMap[N]): Promise<void> {
      await start()
      await boss.send(name, data)
    },

    /** Handles one job at a time from this process. */
    async work<N extends JobName>(
      name: N,
      handler: (data: JobMap[N]) => Promise<void>,
    ): Promise<void> {
      await start()
      working.add(name)
      await boss.work<JobMap[N]>(name, { batchSize: 1, localConcurrency: 1 }, async ([job]) => {
        if (job) await handler(job.data)
      })
    },

    async schedule(name: JobName, cron: string): Promise<void> {
      await start()
      await boss.schedule(name, cron)
    },

    /** Stops fetching new jobs; jobs already running carry on. */
    async stopWorking(): Promise<void> {
      await Promise.all([...working].map((name) => boss.offWork(name, { wait: false })))
      working.clear()
    },

    async stop(): Promise<void> {
      if (started) await boss.stop({ graceful: false })
    },
  }
}

export type Queue = ReturnType<typeof createQueue>
