import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProxy, renderRouting, type RoutingInput } from './proxy.ts'

const lanOnly: RoutingInput = {
  lanIp: '192.168.1.50',
  lanDomain: '192-168-1-50.sslip.io',
  publicDomain: null,
  exposeTowerPublicly: false,
  coreUrl: 'http://hangar-core:3000',
  apps: [
    { name: 'blog', target: { host: 'hangar-app-blog-3', port: 3000 } },
    { name: 'stopped', target: null },
  ],
}

describe('renderRouting', () => {
  it('routes the tower by hostname and bare IP, LAN only', () => {
    const { routers } = renderRouting(lanOnly).http
    expect(routers.tower).toMatchObject({
      entryPoints: ['web'],
      rule: 'Host(`tower.192-168-1-50.sslip.io`) || Host(`192.168.1.50`)',
      service: 'core',
    })
    expect(routers['tower-public']).toBeUndefined()
    expect(routers.hooks).toBeUndefined()
  })

  it('routes running apps to their current container', () => {
    const { routers, services } = renderRouting(lanOnly).http
    expect(routers['app-blog']).toEqual({
      entryPoints: ['web'],
      rule: 'Host(`blog.192-168-1-50.sslip.io`)',
      service: 'app-blog',
    })
    expect(services['app-blog']).toEqual({
      loadBalancer: { servers: [{ url: 'http://hangar-app-blog-3:3000' }] },
    })
  })

  it('leaves stopped apps to the LAN fallback', () => {
    const { routers, services } = renderRouting(lanOnly).http
    expect(routers['app-stopped']).toBeUndefined()
    expect(services['app-stopped']).toBeUndefined()
    expect(routers.fallback).toMatchObject({ entryPoints: ['web'], priority: 1, service: 'core' })
  })

  it('in public mode adds public app routes and a webhook-only hooks route', () => {
    const { routers } = renderRouting({ ...lanOnly, publicDomain: 'example.com' }).http
    expect(routers['app-blog-public']).toMatchObject({
      entryPoints: ['public'],
      rule: 'Host(`blog.example.com`)',
    })
    expect(routers.hooks).toMatchObject({
      entryPoints: ['public'],
      rule: 'Host(`hooks.example.com`) && PathPrefix(`/api/webhooks/`)',
    })
    expect(routers['tower-public']).toBeUndefined()
  })

  it('serves custom domains on the public entrypoint only', () => {
    const apps = [
      {
        name: 'site',
        domains: ['example.com', 'www.example.com'],
        target: lanOnly.apps[0]!.target,
      },
      { name: 'off', domains: ['off.dev'], target: null },
    ]
    const { routers } = renderRouting({ ...lanOnly, apps }).http
    expect(routers['app-site-domains']).toEqual({
      entryPoints: ['public'],
      rule: 'Host(`example.com`) || Host(`www.example.com`)',
      service: 'app-site',
    })
    expect(routers['app-off-domains']).toBeUndefined()
  })

  it('exposes the tower publicly only when asked', () => {
    const { routers } = renderRouting({
      ...lanOnly,
      publicDomain: 'example.com',
      exposeTowerPublicly: true,
    }).http
    expect(routers['tower-public']).toMatchObject({ rule: 'Host(`tower.example.com`)' })
  })

  it('never sends public traffic to core except through hooks or an exposed tower', () => {
    const { routers } = renderRouting({ ...lanOnly, publicDomain: 'example.com' }).http
    const publicToCore = Object.entries(routers)
      .filter(([, r]) => r.entryPoints.includes('public') && r.service === 'core')
      .map(([name]) => name)
    expect(publicToCore).toEqual(['hooks'])
  })

  it('tags every route to core with the entrypoint it came from', () => {
    const { routers } = renderRouting({ ...lanOnly, publicDomain: 'example.com' }).http
    for (const router of Object.values(routers).filter((r) => r.service === 'core')) {
      expect(router.middlewares).toEqual([
        router.entryPoints.includes('public') ? 'from-public' : 'from-web',
      ])
    }
  })
})

describe('createProxy().apply', () => {
  it('writes the file once and skips identical rewrites', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hangar-proxy-'))
    const proxy = createProxy({ dynamicDir: dir, apiUrl: 'http://unused' })
    const config = renderRouting(lanOnly)

    expect(await proxy.apply(config)).toBe(true)
    expect(await proxy.apply(config)).toBe(false)
    expect(await readdir(dir)).toEqual(['hangar.yml'])
    expect(await readFile(path.join(dir, 'hangar.yml'), 'utf8')).toContain('app-blog')
  })
})
