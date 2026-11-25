// Apps that run a published image, and storage that survives deploys (D42), through the real
// dev stack: the worker in hangar-core pulls, starts, health-checks, and routes them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { queueBranchHead, queueDeployment } from '../../src/modules/deployments/service.ts'
import { getEnv, setEnv } from '../../src/modules/env-vars/service.ts'
import { getProject, updateProject } from '../../src/modules/projects/repo.ts'
import {
  checkPart,
  deleteProject,
  followRuntimeLogs,
  installCatalogApp,
  needsRestartForAddresses,
  projectView,
  setDesiredState,
  updateProjectSettings,
} from '../../src/modules/projects/service.ts'
import { replaceAppStorage } from '../../src/modules/storage/repo.ts'
import { storageView } from '../../src/modules/storage/service.ts'
import { stackStatus } from '../../src/worker/stack.ts'
import { ownerNetworkName } from '../../src/platform/names.ts'
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

  it('answers to its own name for the other apps of its account (D50)', async () => {
    const project = await h.createProject('named', {
      repoUrl: '',
      branch: '',
      kind: 'image',
      image: 'traefik/whoami:v1.11',
      port: 80,
    })
    const done = await h.waitForEnd(await queueBranchHead(h.ctx, project, 'manual'))
    expect(done.status).toBe('ready')
    const network = ownerNetworkName(await h.ownerId())
    const ask = (net: string) =>
      docker(
        'run',
        '--rm',
        '--network',
        net,
        'busybox:1.37',
        'wget',
        '-qO-',
        '-T',
        '5',
        `http://${project.name}/`,
      )
    expect(ask(network)).toContain('Hostname:')
    // Another network (another account's) does not know the name.
    const other = `hangar-test-other-${h.runId}`
    docker('network', 'create', other)
    try {
      expect(() => ask(other)).toThrow()
    } finally {
      docker('network', 'rm', other)
    }
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

describe('an app that is not a web page (D51, D52)', () => {
  it('asks its questions, keeps its port to itself, and gets no public address', async () => {
    const ownerId = await h.ownerId()
    const admin = { id: ownerId, role: 'admin' as const }
    // A licence must be accepted by the request itself.
    await expect(
      installCatalogApp(h.ctx, admin, 'minecraft', { name: h.appName('mc-no') }),
    ).rejects.toThrow('Accept the Minecraft EULA first.')
    // A port on the computer is an admin's to give.
    await expect(
      installCatalogApp(h.ctx, { id: ownerId, role: 'member' }, 'minecraft', {
        name: h.appName('mc-member'),
        accepted: ['EULA'],
      }),
    ).rejects.toMatchObject({ code: 'admin_only' })

    const project = await installCatalogApp(h.ctx, admin, 'minecraft', {
      name: h.appName('mc'),
      accepted: ['EULA'],
    })
    h.adopt(project)
    expect(project.web).toBe(false)
    expect(project.strategy).toBe('recreate')
    expect((await getEnv(h.ctx, project.id)).EULA).toBe('TRUE')
    const view = await projectView(h.ctx, project)
    expect(view.url).toBeNull()
    expect(view.ports).toEqual([
      { port: 25565, protocol: 'tcp', hostPort: 25565, address: expect.stringMatching(/:25565$/) },
    ])

    // One app per port on the computer, whoever installs the second.
    await expect(
      installCatalogApp(h.ctx, admin, 'minecraft', {
        name: h.appName('mc-two'),
        accepted: ['EULA'],
      }),
    ).rejects.toMatchObject({ code: 'port_taken' })
    await expect(
      updateProjectSettings(h.ctx, 'admin', project, { hostnames: ['mc.example.com'] }),
    ).rejects.toThrow('not a web page')
  })
})

describe('starting files (D53)', () => {
  it('writes a template file once, and never over the owner’s own edit', async () => {
    const owner = { id: await h.ownerId(), role: 'admin' as const }
    const project = await installCatalogApp(h.ctx, owner, 'files-test', {
      name: h.appName('files'),
    })
    h.adopt(project)
    const volume = `hangar-data-${project.name}-settings`
    const read = () =>
      docker('run', '--rm', '-v', `${volume}:/v`, 'busybox:1.37', 'cat', '/v/conf/app.conf')

    const first = await h.waitForEnd(await queueBranchHead(h.ctx, project, 'manual'))
    expect(first.failureReason).toBeNull()
    expect(read()).toBe('greeting=hello')

    docker(
      'run',
      '--rm',
      '-v',
      `${volume}:/v`,
      'busybox:1.37',
      'sh',
      '-c',
      'echo mine > /v/conf/app.conf',
    )
    const second = await h.waitForEnd(
      await queueBranchHead(h.ctx, (await getProject(h.ctx.db, project.id))!, 'manual'),
    )
    expect(second.status).toBe('ready')
    expect(read()).toBe('mine')
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

    // Each part's state, and its output on Radio; only the template's own parts can be asked for.
    expect(await stackStatus(h.ctx, project)).toMatchObject([{ name: 'redis', state: 'running' }])
    const reading = new AbortController()
    const output = await followRuntimeLogs(h.ctx, project, reading.signal, 'redis')
    const firstChunk = await new Promise<string>((resolve) =>
      output!.once('data', (chunk: Buffer) => resolve(chunk.toString())),
    )
    reading.abort()
    expect(firstChunk.length).toBeGreaterThan(0)
    expect(() => checkPart(h.ctx, project, 'hangar-core')).toThrow(/no part named/)

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

    // An app told its addresses (D48): a new address reaches its env through a fresh container.
    const before = (await getProject(h.ctx.db, project.id))!
    await updateProject(h.ctx.db, project.id, { hostnames: ['stack.example.com'] })
    const withAddress = (await getProject(h.ctx.db, project.id))!
    expect(needsRestartForAddresses(h.ctx, before, withAddress)).toBe(true)
    expect(needsRestartForAddresses(h.ctx, withAddress, withAddress)).toBe(false)
    const fourth = await h.waitForEnd(await queueBranchHead(h.ctx, withAddress, 'manual'))
    expect(fourth.status).toBe('ready')
    expect(
      docker(
        'inspect',
        `hangar-app-${project.name}-${fourth.number}`,
        '--format',
        '{{json .Config.Env}}',
      ),
    ).toContain('PUBLIC_ORIGINS=https://stack.example.com')
    await updateProject(h.ctx.db, project.id, { hostnames: [] })

    // Stopping the app stops its services; starting it brings them back first.
    const current = (await getProject(h.ctx.db, project.id))!
    await setDesiredState(h.ctx, current, 'stopped')
    await eventually(async () => {
      expect(docker('inspect', service, '--format', '{{.State.Running}}').trim()).toBe('false')
    })
    expect(await stackStatus(h.ctx, project)).toMatchObject([{ name: 'redis', state: 'stopped' }])
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
