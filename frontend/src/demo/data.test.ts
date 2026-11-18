import { contract, schemas } from '@hangar/shared'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  demoAccount,
  demoDeployments,
  demoLog,
  demoProjects,
  demoSample,
  demoServers,
  demoSession,
  demoSettings,
  demoStats,
  demoSystemInfo,
} from './data.ts'

// The tour renders the real dashboard, so its sample data must match the API contract exactly.
describe('the sample hangar', () => {
  it('matches the contract', () => {
    expect(() => contract.me.response.parse(demoSession)).not.toThrow()
    expect(() => contract.listServers.response.parse(demoServers)).not.toThrow()
    expect(() => contract.listProjects.response.parse(demoProjects())).not.toThrow()
    expect(() => contract.flightStats.response.parse(demoStats())).not.toThrow()
    expect(() => contract.systemInfo.response.parse(demoSystemInfo)).not.toThrow()
    expect(() => contract.getSettings.response.parse(demoSettings)).not.toThrow()
    expect(() => contract.getAccount.response.parse(demoAccount)).not.toThrow()
    expect(() => schemas.metricsSample.parse(demoSample())).not.toThrow()
    for (const project of demoProjects()) {
      const list = demoDeployments(project.id)
      expect(() => contract.listDeployments.response.parse(list)).not.toThrow()
      for (const d of list) expect(() => z.array(schemas.logLine).parse(demoLog(d))).not.toThrow()
    }
  })

  it('has a live version for every app that has ever deployed successfully', () => {
    for (const project of demoProjects()) {
      expect(project.current?.status).toBe('ready')
      expect(project.recent.length).toBeGreaterThan(0)
    }
  })
})
