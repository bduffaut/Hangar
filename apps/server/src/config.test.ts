import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

const valid = {
  DATABASE_URL: 'postgres://hangar:hangar@localhost:5432/hangar',
  HANGAR_INSTANCE_KEY: Buffer.alloc(32, 1).toString('base64'),
  HANGAR_SESSION_SECRET: 'x'.repeat(32),
}

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(valid)
    expect(config.role).toBe('all')
    expect(config.port).toBe(3000)
    expect(config.lanIp).toBeNull()
    expect(config.instanceKey).toHaveLength(32)
  })

  it('lists every problem in plain language', () => {
    expect(() =>
      loadConfig({ ...valid, HANGAR_INSTANCE_KEY: 'short', HANGAR_ROLE: 'boss' }),
    ).toThrow(ConfigError)
    try {
      loadConfig({ ...valid, HANGAR_INSTANCE_KEY: 'short', HANGAR_ROLE: 'boss' })
    } catch (error) {
      expect((error as Error).message).toContain('HANGAR_INSTANCE_KEY')
      expect((error as Error).message).toContain('HANGAR_ROLE')
    }
  })
})
