import type { Config } from './config.ts'
import { createDb, type Db } from './db/client.ts'
import { createLogger, type Logger } from './logger.ts'
import { type Builder, createBuilder } from './platform/builder.ts'
import { type Crypto, createCrypto } from './platform/crypto.ts'
import { createDocker, type Docker } from './platform/docker.ts'
import { createEvents, type Events } from './platform/events.ts'
import { createGit, type Git } from './platform/git.ts'
import { createGithub, type Github } from './platform/github.ts'
import { createHostMetrics, type HostMetricsReader } from './platform/hostmetrics.ts'
import { createProxy, type Proxy } from './platform/proxy.ts'
import { createQueue, type Queue } from './platform/queue.ts'

/** Everything a service needs from the outside world. Tests build one with fakes. */
export interface Ctx {
  config: Config
  db: Db
  log: Logger
  proxy: Proxy
  docker: Docker
  git: Git
  builder: Builder
  events: Events
  queue: Queue
  crypto: Crypto
  github: Github
  hostMetrics: HostMetricsReader
}

/** Builds the real context. Call `close` to release connections. */
export function createContext(config: Config, log: Logger = createLogger(config)) {
  const { db, pool } = createDb(config.databaseUrl)
  const ctx: Ctx = {
    config,
    db,
    log,
    proxy: createProxy({ dynamicDir: config.traefikDynamicDir, apiUrl: config.traefikApiUrl }),
    docker: createDocker(),
    git: createGit(),
    builder: createBuilder({ railpackFrontend: config.railpackFrontend }),
    events: createEvents(pool, log),
    queue: createQueue({ connectionString: config.databaseUrl, log }),
    crypto: createCrypto(config.instanceKey),
    github: createGithub(),
    hostMetrics: createHostMetrics({ procDir: config.hostProcDir, rootDir: config.hostRootDir }),
  }
  const close = async () => {
    await ctx.queue.stop()
    await ctx.events.close()
    await pool.end()
  }
  return { ctx, close }
}
