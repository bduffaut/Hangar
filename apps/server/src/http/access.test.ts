import { describe, expect, it } from 'vitest'
import { type AccessPolicy, classifyRequest } from './access.ts'

const policy: AccessPolicy = {
  towerHosts: new Set(['tower.192-168-1-50.sslip.io', '192.168.1.50', 'localhost:5173']),
  publicTowerHost: null,
  hooksHost: 'hooks.example.com',
  origins: new Set(),
}

const classify = (host: string, path: string, entrypoint?: string, p = policy) =>
  classifyRequest(p, {
    host,
    path,
    headers: entrypoint ? { 'x-hangar-entrypoint': entrypoint } : {},
  })

describe('classifyRequest', () => {
  it('serves the API on tower hostnames only', () => {
    expect(classify('tower.192-168-1-50.sslip.io', '/api/projects')).toBe('api')
    expect(classify('tower.192-168-1-50.sslip.io:80', '/api/projects')).toBe('api')
    expect(classify('192.168.1.50', '/api/projects')).toBe('api')
    expect(classify('localhost:5173', '/api/projects')).toBe('api')
    expect(classify('blog.192-168-1-50.sslip.io', '/api/projects')).toBe('app-not-running')
    expect(classify('attacker.example.net', '/api/projects')).toBe('app-not-running')
  })

  it('shows the not-running page for unknown LAN apps', () => {
    expect(classify('blog.192-168-1-50.sslip.io', '/')).toBe('app-not-running')
  })

  it('allows health and webhooks from anywhere', () => {
    expect(classify('anything', '/api/health')).toBe('health')
    expect(classify('hooks.example.com', '/api/webhooks/github/x', 'public')).toBe('webhook')
  })

  it('keeps the public entrypoint away from the API', () => {
    expect(classify('tower.192-168-1-50.sslip.io', '/api/projects', 'public')).toBe('not-found')
    expect(classify('tower.example.com', '/api/projects', 'public')).toBe('not-found')
    expect(classify('hooks.example.com', '/api/projects', 'public')).toBe('not-found')
  })

  it('lets the public entrypoint reach only the address check, on any hostname', () => {
    expect(classify('blog.example.com', '/.well-known/hangar-check/abc', 'public')).toBe(
      'address-check',
    )
    expect(classify('tower.192-168-1-50.sslip.io', '/.well-known/hangar-check/abc')).toBe('api')
  })

  it('serves the API publicly only on an exposed tower hostname', () => {
    const exposed = { ...policy, publicTowerHost: 'tower.example.com' }
    expect(classify('tower.example.com', '/api/projects', 'public', exposed)).toBe('api')
    expect(classify('blog.example.com', '/api/projects', 'public', exposed)).toBe('not-found')
  })
})
