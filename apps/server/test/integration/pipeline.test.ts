import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDeploymentByNumber } from '../../src/modules/deployments/repo.ts'
import {
  queueDeployment,
  queueRollback,
  requestCancel,
} from '../../src/modules/deployments/service.ts'
import { setEnv } from '../../src/modules/env-vars/service.ts'
import { getProject, updateProject } from '../../src/modules/projects/repo.ts'
import { createFixtureRepo, createHarness, docker, eventually } from './harness.ts'

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

describe('deploying fixtures', () => {
  it.each([
    ['static-site', 'fixture: static-site'],
    ['node-express', 'fixture: node-express'],
    ['vite-app', 'fixture: vite-app'],
  ])('%s builds with Railpack and serves at its hostname', async (fixture, expected) => {
    const project = await h.createProject(fixture, { repoUrl: repo.url, rootDir: fixture })
    const done = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: v1, trigger: 'manual' }),
    )

    expect(done.failureReason).toBeNull()
    expect(done.status).toBe('ready')
    expect(done.commitMessage).toBe('Fixtures v1')
    expect(done.port).toBe(3000)
    const response = await h.fetchApp(project.name)
    expect(response.status).toBe(200)
    expect(response.body).toContain(expected)
  })
})

describe('a project through its lifecycle', () => {
  let projectId: string
  const name = () => `it-${h.runId}-app`

  it('builds a Dockerfile app with env vars and the port from EXPOSE', async () => {
    const project = await h.createProject('app', { repoUrl: repo.url, rootDir: 'dockerfile-app' })
    projectId = project.id
    await setEnv(h.ctx, project.id, { GREETING: 'hello' })
    const done = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: v1, trigger: 'manual' }),
    )

    expect(done.failureReason).toBeNull()
    expect(done.status).toBe('ready')
    expect(done.port).toBe(8080)
    const { body } = await h.fetchApp(name())
    expect(body).toContain('fixture: dockerfile-app greeting=hello build-secret=yes')
  })

  it('keeps the previous version serving when a deploy fails its health check', async () => {
    const before = (await getProject(h.ctx.db, projectId))!
    await updateProject(h.ctx.db, projectId, { rootDir: 'broken-healthcheck', port: 8080 })
    const project = (await getProject(h.ctx.db, projectId))!
    const done = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: v1, trigger: 'manual' }),
    )

    expect(done.status).toBe('failed')
    expect(done.failureCode).toBe('health_check_failed')
    expect((await getProject(h.ctx.db, projectId))!.currentDeploymentId).toBe(
      before.currentDeploymentId,
    )
    expect((await h.ctx.docker.listManagedApps(projectId)).map((c) => c.deploymentId)).toEqual([
      before.currentDeploymentId,
    ])
    expect((await h.fetchApp(name())).body).toContain('fixture: dockerfile-app greeting=hello')
  })

  it('deploys a new commit, then rolls back to the first image without rebuilding', async () => {
    await updateProject(h.ctx.db, projectId, { rootDir: 'dockerfile-app', port: null })
    repo.write(
      'dockerfile-app/server.js',
      repo.read('dockerfile-app/server.js').replace('fixture: dockerfile-app', 'fixture: v2'),
    )
    const v2 = repo.commit('Fixtures v2')
    const project = (await getProject(h.ctx.db, projectId))!
    const second = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: v2, trigger: 'manual' }),
    )
    expect(second.status).toBe('ready')
    expect((await h.fetchApp(name())).body).toContain('fixture: v2')

    const first = (await getDeploymentByNumber(h.ctx.db, projectId, 1))!
    const rollback = await h.waitForEnd(await queueRollback(h.ctx, first))

    expect(rollback.status).toBe('ready')
    expect(rollback.trigger).toBe('rollback')
    expect(rollback.imageTag).toBe(first.imageTag)
    expect((await h.fetchApp(name())).body).toContain('fixture: dockerfile-app greeting=hello')
    // Previous versions get a grace period to shut down after traffic has moved.
    await eventually(async () => {
      expect(await h.ctx.docker.listManagedApps(projectId)).toHaveLength(1)
    })
  })
})

describe('interrupting builds', () => {
  // A build that takes long enough to interrupt. The run ID keeps BuildKit from caching it.
  const slowBuild = (dir: string) => {
    repo.write(
      `${dir}/Dockerfile`,
      `FROM alpine:3.22\nRUN echo ${h.runId} && sleep 300\nCMD ["sleep", "infinity"]\n`,
    )
    return repo.commit(`Slow build ${dir}`)
  }

  it('cancels a running build', async () => {
    const sha = slowBuild('slow-cancel')
    const project = await h.createProject('cancel', { repoUrl: repo.url, rootDir: 'slow-cancel' })
    const deployment = await queueDeployment(h.ctx, project, { commitSha: sha, trigger: 'manual' })
    await h.waitForStatus(deployment, 'building')
    await sleep(3_000)
    await requestCancel(h.ctx, deployment.id)

    const done = await h.waitForEnd(deployment, 30_000)
    expect(done.status).toBe('cancelled')
    expect(done.failureCode).toBe('cancelled_by_user')
  })

  it('recovers cleanly when hangar-core is killed mid-build', async () => {
    const live = await h.createProject('survivor', { repoUrl: repo.url, rootDir: 'static-site' })
    const ready = await h.waitForEnd(
      await queueDeployment(h.ctx, live, { commitSha: v1, trigger: 'manual' }),
    )
    expect(ready.status).toBe('ready')

    const sha = slowBuild('slow-crash')
    const project = await h.createProject('crash', { repoUrl: repo.url, rootDir: 'slow-crash' })
    const deployment = await queueDeployment(h.ctx, project, { commitSha: sha, trigger: 'manual' })
    await h.waitForStatus(deployment, 'building')
    await sleep(3_000)

    docker('kill', 'hangar-core')
    docker('start', 'hangar-core')
    const done = await h.waitForEnd(deployment, 120_000)

    expect(done.status).toBe('failed')
    expect(done.failureCode).toBe('interrupted')
    expect(await h.ctx.docker.listManagedApps(project.id)).toEqual([])
    expect(docker('exec', 'hangar-core', 'ls', '-A', h.ctx.config.buildDir)).toBe('')
    expect((await h.fetchApp(live.name)).body).toContain('fixture: static-site')
  })

  it('fails a build whose deployment is overtaken by a rollback, leaving the rollback live', async () => {
    const project = await h.createProject('overtaken', {
      repoUrl: repo.url,
      rootDir: 'dockerfile-app',
    })
    const first = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: v1, trigger: 'manual' }),
    )
    expect(first.status).toBe('ready')

    // A build slow enough to queue a rollback while it runs.
    const app = repo.read('dockerfile-app/Dockerfile')
    repo.write(
      'slow-app/Dockerfile',
      app.replace('COPY server.js .', `RUN echo ${h.runId}-slow && sleep 20\nCOPY server.js .`),
    )
    repo.write('slow-app/server.js', repo.read('dockerfile-app/server.js'))
    const slowSha = repo.commit('Slow app')
    await updateProject(h.ctx.db, project.id, { rootDir: 'slow-app' })
    const slow = await queueDeployment(h.ctx, (await getProject(h.ctx.db, project.id))!, {
      commitSha: slowSha,
      trigger: 'manual',
    })
    await h.waitForStatus(slow, 'building')

    const rollback = await h.waitForEnd(await queueRollback(h.ctx, first), 120_000)
    expect(rollback.status).toBe('ready')
    const overtaken = await h.waitForEnd(slow)

    expect(overtaken.status).toBe('failed')
    expect(overtaken.failureCode).toBe('superseded')
    expect((await getProject(h.ctx.db, project.id))!.currentDeploymentId).toBe(rollback.id)
    expect((await h.fetchApp(project.name)).body).toContain('fixture: dockerfile-app')
  })
})

describe('repository safety', () => {
  it('refuses a root directory that is a symlink out of the repository', async () => {
    repo.symlink('escape', '/etc')
    const sha = repo.commit('Symlink out of the repo')
    const project = await h.createProject('escape', { repoUrl: repo.url, rootDir: 'escape' })
    const done = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: sha, trigger: 'manual' }),
    )

    expect(done.status).toBe('failed')
    expect(done.failureCode).toBe('build_failed')
    expect(done.failureReason).toContain('outside the repository')
  })

  it('refuses a build whose files link to the server, before Railpack reads them', async () => {
    // Railpack copies a static site's Caddyfile into the image; this one points at core's secrets.
    repo.write('leaky-site/index.html', '<h1>hi</h1>')
    repo.symlink('leaky-site/Caddyfile', '/proc/1/environ')
    const sha = repo.commit('Leaky static site')
    const project = await h.createProject('leaky', { repoUrl: repo.url, rootDir: 'leaky-site' })
    const done = await h.waitForEnd(
      await queueDeployment(h.ctx, project, { commitSha: sha, trigger: 'manual' }),
    )

    expect(done.status).toBe('failed')
    expect(done.failureCode).toBe('build_failed')
    expect(done.failureReason).toContain(
      '"leaky-site/Caddyfile" is a symlink to a file outside the repository',
    )
    expect(await h.ctx.docker.listTags(`hangar/${project.name}`)).toEqual([])
  })
})
