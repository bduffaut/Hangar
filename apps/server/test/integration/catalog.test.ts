// Real catalog templates, installed and deployed for real through the dev stack. Opt in, since
// they download real apps (Immich is several gigabytes):
//
//   HANGAR_TEST_CATALOG=immich,navidrome pnpm vitest run --project integration catalog
//
// Each app must install, pull, start (with its stack services, D44), pass Hangar's health check,
// and answer through Traefik. Run it after adding a template or changing its version.
import { CATALOG } from '@hangar/shared'
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
    const project = await installCatalogApp(h.ctx, owner, id, { name: h.appName(id) })
    h.adopt(project)
    const done = await h.waitForEnd(await queueBranchHead(h.ctx, project, 'manual'), 35 * 60_000)
    expect(done.failureReason).toBeNull()
    expect(done.status).toBe('ready')
    const res = await h.fetchApp(project.name)
    expect(res.status).toBeLessThan(500)
  })
})
