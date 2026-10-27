import { buildApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'
import { createContext } from './context.ts'
import { runMigrations } from './db/migrate.ts'
import { createLogger } from './logger.ts'
import { seedSettings } from './modules/settings/service.ts'
import { startWorker } from './worker/jobs.ts'

async function main() {
  const config = loadConfig(process.env)
  const log = createLogger(config)
  const { ctx, close } = createContext(config, log)

  await runMigrations(ctx.db.$client, config.migrationsDir)
  log.info('Database is up to date')
  await seedSettings(ctx)

  const runsApi = config.role !== 'worker'
  const runsWorker = config.role !== 'api'

  const worker = runsWorker ? await startWorker(ctx) : null
  const app = runsApi ? buildApp(ctx) : null
  await app?.listen({ host: '0.0.0.0', port: config.port })

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down')
    await app?.close()
    await worker?.stop()
    await close()
    process.exit(0)
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error)
  process.exit(1)
})
