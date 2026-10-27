import { describe, expect, it } from 'vitest'
import { failureCopy, statusCopy } from './copy.ts'
import { FAILURE_CODES } from './failures.ts'
import { DEPLOYMENT_STATUSES } from './statuses.ts'

describe('copy', () => {
  it('labels and explains every deployment status', () => {
    for (const status of DEPLOYMENT_STATUSES) {
      expect(statusCopy[status].label.length).toBeGreaterThan(0)
      expect(statusCopy[status].meaning.length).toBeGreaterThan(0)
    }
  })

  it('explains every failure code with a fix', () => {
    for (const code of FAILURE_CODES) {
      expect(failureCopy[code].explanation.length).toBeGreaterThan(0)
      expect(failureCopy[code].fix.length).toBeGreaterThan(0)
    }
  })

  it('keeps puns out of failure explanations', () => {
    const themed = /airborne|grounded|runway|preflight|scrubbed|holding|taking off|wheels up/i
    for (const code of FAILURE_CODES) {
      expect(failureCopy[code].explanation).not.toMatch(themed)
      expect(failureCopy[code].fix).not.toMatch(themed)
    }
  })
})
