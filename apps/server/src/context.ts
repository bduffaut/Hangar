import type { Config } from './config.ts'
import type { Db } from './db/client.ts'
import type { Logger } from './logger.ts'
import type { Proxy } from './platform/proxy.ts'

/** Everything a service needs from the outside world. Tests build one with fakes. */
export interface Ctx {
  config: Config
  db: Db
  log: Logger
  proxy: Proxy
}
