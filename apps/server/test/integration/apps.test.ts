// Apps that run a published image, and storage that survives deploys (D42), through the real
// dev stack: the worker in hangar-core pulls, starts, health-checks, and routes them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { queueBranchHead, queueDeployment } from '../../src/modules/deployments/service.ts'
import { getEnv, setEnv } from '../../src/modules/env-vars/service.ts'
import { getProject } from '../../src/modules/projects/repo.ts'
import {
  deleteProject,
  installCatalogApp,
  setDesiredState,
} from '../../src/modules/projects/service.ts'
import { replaceAppStorage } from '../../src/modules/storage/repo.ts'
import { storageView } from '../../src/modules/storage/service.ts'
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

describe('a stack (D44)', () => {
  it('runs its services privately beside the app, keeps them across deploys, and removes them with it', async () => {
    const owner = { id: await h.ownerId(), role: 'admin' as const }
    const project = await installCatalogApp(h.ctx, owner, 'stack-test', {
      name: h.appName('stack'),
    })
    h.adopt(project)
    const service = `hangar-svc-${project.name}-redis`
    const network = `hangar-stack-${project.id}`

    const first = await h.waitForEnd(await queueBranchHead(h.ctx, project, 'manual'))
    expect(first.failureReason).toBeNull()
    expect(first.status).toBe('ready')
    expect((await h.fetchApp(project.name)).status).toBe(200)

    // The service answers at its name on the stack network, which the app joins and nothing else
    // does: it is not on the account's network, so other apps cannot reach it.
    expect(docker('exec', service, 'valkey-cli', '-h', 'redis', 'ping')).toContain('PONG')
    const app = `hangar-app-${project.name}-${first.number}`
    const appNetworks = docker('inspect', app, '--format', '{{json .NetworkSettings.Networks}}')
    expect(appNetworks).toContain(network)
    const serviceNetworks = docker(
      'inspect',
      service,
      '--format',
      '{{json .NetworkSettings.Networks}}',
    )
    expect(Object.keys(JSON.parse(serviceNetworks))).toEqual([network])

    // Its secret was made for this install and reaches the service through ${TEST_SECRET}.
    const env = await getEnv(h.ctx, project.id)
    expect(env.TEST_SECRET).toMatch(/^[a-f0-9]{48}$/)
    expect(docker('inspect', service, '--format', '{{json .Config.Env}}')).toContain(
      `SECRET_COPY=${env.TEST_SECRET}`,
    )
    // Its storage is a kept folder of the app, labelled with the service.
    const storage = await storageView(h.ctx, project)
    expect(storage.volumes).toMatchObject([{ name: 'cache', mountPath: '/data', service: 'redis' }])
    docker('exec', service, 'valkey-cli', 'set', 'kept', 'yes')
    docker('exec', service, 'valkey-cli', 'save')

    // A redeploy leaves an unchanged service alone.
    const serviceId = docker('inspect', service, '--format', '{{.Id}}').trim()
    const again = await h.waitForEnd(
      await queueBranchHead(h.ctx, (await getProject(h.ctx.db, project.id))!, 'manual'),
    )
    expect(again.status).toBe('ready')
    expect(docker('inspect', service, '--format', '{{.Id}}').trim()).toBe(serviceId)

    // A changed secret replaces it; its data survives in the kept folder.
    await setEnv(h.ctx, project.id, { TEST_SECRET: 'changed' })
    const third = await h.waitForEnd(
      await queueBranchHead(h.ctx, (await getProject(h.ctx.db, project.id))!, 'manual'),
    )
    expect(third.status).toBe('ready')
    expect(docker('inspect', service, '--format', '{{.Id}}').trim()).not.toBe(serviceId)
    expect(docker('exec', service, 'valkey-cli', 'get', 'kept')).toContain('yes')

    // Stopping the app stops its services; starting it brings them back first.
    const current = (await getProject(h.ctx.db, project.id))!
    await setDesiredState(h.ctx, current, 'stopped')
    await eventually(async () => {
      expect(docker('inspect', service, '--format', '{{.State.Running}}').trim()).toBe('false')
    })
    await setDesiredState(h.ctx, (await getProject(h.ctx.db, project.id))!, 'running')
    await eventually(async () => {
      expect(docker('inspect', service, '--format', '{{.State.Running}}').trim()).toBe('true')
      expect((await h.fetchApp(project.name)).status).toBe(200)
    })

    // Deleting the app removes its services and network.
    await deleteProject(h.ctx, (await getProject(h.ctx.db, project.id))!, 'delete')
    expect(await h.ctx.docker.listManagedServices(project.id)).toEqual([])
    expect(() => docker('network', 'inspect', network)).toThrow()
  })
})
