// Real catalog templates, installed and deployed for real through the dev stack. Opt in, since
// they download real apps (Immich is several gigabytes):
//
//   HANGAR_TEST_CATALOG=immich,navidrome pnpm vitest run --project integration catalog
//
// HANGAR_TEST_HOST_NETWORK=1 also turns on the home network option of templates that offer it.
//
// Each app must install, pull, start (with its stack services, D44), pass Hangar's health check,
// and answer through Traefik. Run it after adding a template or changing its version.
import { CATALOG, catalogApp } from '@hangar/shared'
import { connect } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { queueBranchHead } from '../../src/modules/deployments/service.ts'
import { installCatalogApp } from '../../src/modules/projects/service.ts'
import { createHarness } from './harness.ts'

const ids = (process.env.HANGAR_TEST_CATALOG ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
const h = createHarness()

beforeAll(async () => {
  if (ids.length) await h.start()
})
afterAll(async () => {
  if (ids.length) await h.close()
})

describe.skipIf(ids.length === 0)('catalog templates, for real', () => {
  it.each(ids)('%s installs, starts, and answers', { timeout: 40 * 60_000 }, async (id) => {
    expect(CATALOG.map((t) => t.id)).toContain(id)
    const owner = { id: await h.ownerId(), role: 'admin' as const }
    const template = catalogApp(id)!
    // Its questions (D52) answered yes, as the person installing it would.
    const accepted = (template.questions ?? []).map((q) => q.env)
    // HANGAR_TEST_HOST_NETWORK=1 turns on the home network option where a template offers it (D54).
    const hostNetwork = Boolean(process.env.HANGAR_TEST_HOST_NETWORK && template.hostNetwork)
    const project = await installCatalogApp(h.ctx, owner, id, {
      name: h.appName(id),
      accepted,
      ...(hostNetwork ? { hostNetwork } : {}),
    })
    h.adopt(project)
    const done = await h.waitForEnd(await queueBranchHead(h.ctx, project, 'manual'), 35 * 60_000)
    expect(done.failureReason).toBeNull()
    expect(done.status).toBe('ready')
    // Its TCP ports (D51) answer on the computer's address (127.0.0.1 here).
    for (const p of (template.ports ?? []).filter((p) => p.protocol === 'tcp')) {
      expect(await accepts('127.0.0.1', p.port)).toBe(true)
    }
    if (template.web === false) return
    // Through Traefik, like a visitor: a 400 would be an app refusing Hangar's proxy (D53).
    const res = await h.fetchApp(project.name)
    expect(res.status).toBeLessThan(400)
  })
})

function accepts(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 5_000 })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}
