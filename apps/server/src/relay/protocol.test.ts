import { describe, expect, it } from 'vitest'
import { isServerRequest } from './protocol.ts'

const id = '0190f0a0-0000-7000-8000-000000000000'

describe('isServerRequest', () => {
  it('lets through a server’s own endpoints and streams', () => {
    expect(isServerRequest('GET', '/api/projects')).toBe(true)
    expect(isServerRequest('POST', `/api/projects/${id}/deploy`)).toBe(true)
    expect(isServerRequest('GET', `/api/deployments/${id}/logs/stream?after=3`)).toBe(true)
    expect(isServerRequest('GET', '/api/events')).toBe(true)
    expect(isServerRequest('PATCH', '/api/settings')).toBe(true)
  })

  it('keeps account business here', () => {
    for (const path of [
      '/api/users',
      '/api/servers',
      '/api/auth/me',
      '/api/invites',
      '/api/access',
    ]) {
      expect([path, isServerRequest('GET', path)]).toEqual([path, false])
    }
    expect(isServerRequest('DELETE', '/api/projects')).toBe(false)
  })

  it('refuses paths that would resolve somewhere else', () => {
    for (const path of [
      '/api/projects/..',
      '/api/projects/%2e%2e',
      '/api/projects/%2E%2E/deployments',
      `/api/projects/${id}/env/..%2fx/reveal`,
      '/api/projects/.',
      '/api/projects/a%5cb',
    ]) {
      expect([path, isServerRequest('GET', path)]).toEqual([path, false])
    }
  })
})
