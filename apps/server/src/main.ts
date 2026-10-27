import { buildApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'
import type { Ctx } from './context.ts'
import { createDb } from './db/client.ts'
import { runMigrations } from './db/migrate.ts'
import { createLogger } from './logger.ts'
import { seedSettings } from './modules/settings/service.ts'
import { createProxy } from './platform/proxy.ts'
import { syncRouting } from './worker/reconciler.ts'

async function main() {
  const config = loadConfig(process.env)
  const log = createLogger(config)
  const { db, pool } = createDb(config.databaseUrl)

  await runMigrations(pool, config.migrationsDir)
  log.info('Database is up to date')

  const ctx: Ctx = {
    config,
    db,
    log,
    proxy: createProxy({ dynamicDir: config.traefikDynamicDir, apiUrl: config.traefikApiUrl }),
  }
  await seedSettings(ctx)

  const runsApi = config.role !== 'worker'
  const runsWorker = config.role !== 'api'

  if (runsWorker) await syncRouting(ctx)

  const app = runsApi ? buildApp(ctx) : null
  await app?.listen({ host: '0.0.0.0', port: config.port })

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down')
    await app?.close()
    await pool.end()
    process.exit(0)
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error)
  process.exit(1)
})
