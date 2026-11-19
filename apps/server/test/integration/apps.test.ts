// Apps that run a published image, and storage that survives deploys (D42), through the real
// dev stack: the worker in hangar-core pulls, starts, health-checks, and routes them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { queueBranchHead, queueDeployment } from '../../src/modules/deployments/service.ts'
import { getProject } from '../../src/modules/projects/repo.ts'
import { replaceAppStorage } from '../../src/modules/storage/repo.ts'
import { createFixtureRepo, createHarness } from './harness.ts'

const h = createHarness()
const repo = createFixtureRepo(h.runId)
let v1: string

beforeAll(async () => {
  await h.start()
  v1 = repo.commit('Fixtures v1')
})

afterAll(async () => {
  await h.close()
  repo.remove()
})

describe('an app from a published image', () => {
  it('pulls, names, starts, and routes it, and updates it in place', async () => {
    const project = await h.createProject('whoami', {
      repoUrl: '',
      branch: '',
      kind: 'image',
      image: 'traefik/whoami:v1.11',
      port: 80,
    })
    const first = await h.waitForEnd(await queueBranchHead(h.ctx, project, 'manual'))
    expect(first.failureReason).toBeNull()
    expect(first.status).toBe('ready')
    // The image's digest stands in for a commit, and the pulled image gets the app's own name.
    expect(first.commitSha).toMatch(/^[a-f0-9]{64}$/)
    expect(first.commitMessage).toBe('traefik/whoami:v1.11')
    expect(first.imageTag).toBe(`hangar/${project.name}:1-${first.commitSha.slice(0, 7)}`)
    expect((await h.fetchApp(project.name)).body).toContain('Hostname:')

    const second = await h.waitForEnd(
      await queueBranchHead(h.ctx, (await getProject(h.ctx.db, project.id))!, 'manual'),
    )
    expect(second.status).toBe('ready')
    expect(second.commitSha).toBe(first.commitSha)
    expect((await h.fetchApp(project.name)).status).toBe(200)
  })

  it('fails clearly when the image does not exist', async () => {
    const project = await h.createProject('missing', {
      repoUrl: '',
      branch: '',
      kind: 'image',
      image: 'traefik/whoami:no-such-version-anywhere',
    })
    const done = await h.waitForEnd(await queueBranchHead(h.ctx, project, 'manual'))
    expect(done.status).toBe('failed')
    expect(done.failureCode).toBe('pull_failed')
  })
})

describe('storage', () => {
  it('keeps what an app writes across deploys, stopping the old version first', async () => {
    const project = await h.createProject('stateful', {
      repoUrl: repo.url,
      rootDir: 'stateful-app',
      strategy: 'recreate',
    })
    await replaceAppStorage(h.ctx.db, project.id, {
      volumes: [{ name: 'data', mountPath: '/data' }],
    })
    const first = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: v1, trigger: 'manual' }),
    )
    expect(first.failureReason).toBeNull()
    expect((await h.fetchApp(project.name)).body).toContain('starts=1')

    const second = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: v1, trigger: 'manual' }),
    )
    expect(second.status).toBe('ready')
    // A fresh container, the same storage.
    expect((await h.fetchApp(project.name)).body).toContain('starts=2')
    const volumes = await h.ctx.docker.listDataVolumes()
    expect(volumes.find((v) => v.name === `hangar-data-${project.name}-data`)).toBeDefined()
  })
})
