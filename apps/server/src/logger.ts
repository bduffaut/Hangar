import pino from 'pino'
import type { Config } from './config.ts'

export function createLogger(config: Pick<Config, 'logLevel' | 'isProduction'>) {
  return pino({
    level: config.logLevel,
    transport: config.isProduction ? undefined : { target: 'pino-pretty' },
  })
}

export type Logger = ReturnType<typeof createLogger>
