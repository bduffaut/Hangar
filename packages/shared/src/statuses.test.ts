import { describe, expect, it } from 'vitest'
import { canTransition, DEPLOYMENT_STATUSES, isTerminal } from './statuses.ts'

describe('deployment state machine', () => {
  it('follows the happy path', () => {
    expect(canTransition('queued', 'building')).toBe(true)
    expect(canTransition('building', 'deploying')).toBe(true)
    expect(canTransition('deploying', 'ready')).toBe(true)
  })

  it('allows rollbacks to skip building', () => {
    expect(canTransition('queued', 'deploying')).toBe(true)
  })

  it('cannot cancel once deploying, so the swap always finishes or fails cleanly', () => {
    expect(canTransition('deploying', 'cancelled')).toBe(false)
  })

  it('never leaves a terminal status', () => {
    for (const from of ['ready', 'failed', 'cancelled'] as const) {
      expect(isTerminal(from)).toBe(true)
      for (const to of DEPLOYMENT_STATUSES) expect(canTransition(from, to)).toBe(false)
    }
  })
})
