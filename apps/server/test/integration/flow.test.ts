// Stage 3 exit check: the whole flow over HTTP, through Traefik, as the dashboard will use it.
import { createHmac, randomBytes } from 'node:crypto'
import { type IncomingMessage, request } from 'node:http'
import { sign } from '@fastify/cookie'
import type { DeploymentView, ProjectView } from '@hangar/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sessions, users } from '../../src/db/schema.ts'
import { csrfTokenFor } from '../../src/modules/auth/service.ts'
import { getProject } from '../../src/modules/projects/repo.ts'
import { createFixtureRepo, createHarness, eventually } from './harness.ts'

const h = createHarness()
const repo = createFixtureRepo(h.runId)
const TOWER = 'tower.127-0-0-1.sslip.io'
let cookie = ''
let csrf = ''
let userId = ''

interface Response {
  status: number
  body: string
  json: <T = any>() => T // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** A request to core through Traefik on port 80, as the browser makes it. */
function api(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const payload =
    body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: 80,
        method,
        path,
        headers: {
          host: TOWER,
          origin: `http://${TOWER}`,
          cookie,
          'x-csrf-token': csrf,
          ...(payload ? { 'content-type': 'application/json' } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let text = ''
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: text, json: () => JSON.parse(text) }),
        )
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

interface SseEvent {
  event: string
  data: any // eslint-disable-line @typescript-eslint/no-explicit-any
  id?: string
}

/** Opens a server-sent event stream and collects its events. */
function openStream(path: string) {
  const events: SseEvent[] = []
  let response: IncomingMessage | null = null
  const req = request(
    { host: '127.0.0.1', port: 80, path, headers: { host: TOWER, cookie } },
    (res) => {
      response = res
      let buffer = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        buffer += chunk
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const fields = Object.fromEntries(
            block
              .split('\n')
              .filter((l) => !l.startsWith(':'))
              .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]),
          )
          if (fields.event)
            events.push({
              event: fields.event,
              data: JSON.parse(fields.data ?? 'null'),
              id: fields.id,
            })
        }
      })
    },
  )
  req.end()
  return {
    events,
    async waitFor(predicate: (e: SseEvent) => boolean, timeoutMs = 300_000) {
      await eventually(async () => {
        expect(events.some(predicate)).toBe(true)
      }, timeoutMs)
      return events.find(predicate)!
    },
    close() {
      response?.destroy()
      req.destroy()
    },
  }
}

async function waitForDeployment(id: string, timeoutMs = 300_000): Promise<DeploymentView> {
  let deployment: DeploymentView | null = null
  await eventually(async () => {
    deployment = (await api('GET', `/api/deployments/${id}`)).json()
    expect(['ready', 'failed', 'cancelled']).toContain(deployment!.status)
  }, timeoutMs)
  return deployment!
}

beforeAll(async () => {
  await h.start()
  repo.commit('Fixtures v1')
  // Sign in by creating a session directly: the dev instance's own account is left alone.
  const [user] = await h.ctx.db
    .insert(users)
    .values({ username: `it-${h.runId}`, passwordHash: 'x' })
    .returning()
  userId = user!.id
  const token = randomBytes(32).toString('base64url')
  const sessionId = (await import('node:crypto')).createHash('sha256').update(token).digest('hex')
  await h.ctx.db
    .insert(sessions)
    .values({ id: sessionId, userId, expiresAt: new Date(Date.now() + 3_600_000) })
  cookie = `hangar_session=${sign(token, h.ctx.config.sessionSecret)}`
  csrf = csrfTokenFor(h.ctx, sessionId)
})

afterAll(async () => {
  await h.ctx.db.delete(users).where(eq(users.id, userId))
  await h.close()
  repo.remove()
})

describe('the full flow over HTTP', () => {
  let project: ProjectView
  let first: DeploymentView

  it('creates a project and streams its first build to completion', async () => {
    const res = await api('POST', '/api/projects', {
      name: `it-${h.runId}-flow`,
      repoUrl: repo.url,
      rootDir: 'dockerfile-app',
      triggerMode: 'manual',
    })
    expect(res.status, res.body).toBe(200)
    project = res.json()
    h.adopt((await getProject(h.ctx.db, project.id))!)
    expect(project.branch).toBe('main') // detected from the repository
    expect(project.latest?.status).toBe('queued')

    const logs = openStream(`/api/deployments/${project.latest!.id}/logs/stream`)
    const done = await logs.waitFor((e) => e.event === 'done')
    logs.close()
    expect(done.data.status).toBe('ready')
    const lines = logs.events.filter((e) => e.event === 'log')
    expect(lines.map((e) => e.data.line).join('\n')).toContain('is live')
    // Sequence numbers arrive in order with matching event IDs, so a reconnect can resume.
    expect(lines.map((e) => Number(e.id))).toEqual(lines.map((_, i) => i))

    first = (await api('GET', `/api/deployments/${project.latest!.id}`)).json()
    expect(first.isCurrent).toBe(true)
    expect((await h.fetchApp(project.name)).body).toContain('fixture: dockerfile-app greeting=none')
  })

  it('resumes the log stream from Last-Event-ID', async () => {
    const all = (await api('GET', `/api/deployments/${first.id}/logs`)).json<{ seq: number }[]>()
    const logs = openStream(`/api/deployments/${first.id}/logs/stream?after=${all.length - 3}`)
    await logs.waitFor((e) => e.event === 'done')
    logs.close()
    expect(logs.events.filter((e) => e.event === 'log')).toHaveLength(2)
  })

  it('applies env vars on the next deploy and announces status changes', async () => {
    const events = openStream('/api/events')
    await events.waitFor((e) => e.event === 'snapshot')
    expect(
      (await api('PUT', `/api/projects/${project.id}/env`, { vars: { GREETING: 'hi' } })).status,
    ).toBe(200)
    const deploy = await api('POST', `/api/projects/${project.id}/deploy`)
    expect(deploy.status).toBe(200)
    const second: DeploymentView = deploy.json()
    expect(second.number).toBe(2)
    await events.waitFor(
      (e) => e.event === 'status' && e.data.deploymentId === second.id && e.data.status === 'ready',
    )
    events.close()
    const statuses = events.events
      .filter((e) => e.event === 'status' && e.data.deploymentId === second.id)
      .map((e) => e.data.status)
    expect(statuses).toEqual(expect.arrayContaining(['building', 'deploying', 'ready']))
    expect((await h.fetchApp(project.name)).body).toContain('greeting=hi build-secret=yes')
  })

  it('rolls back to the first deployment', async () => {
    const res = await api('POST', `/api/deployments/${first.id}/rollback`)
    expect(res.status).toBe(200)
    const rollback = await waitForDeployment(res.json().id)
    expect(rollback).toMatchObject({
      status: 'ready',
      trigger: 'rollback',
      sourceDeploymentId: first.id,
      isCurrent: true,
    })
    const history = (await api('GET', `/api/projects/${project.id}/deployments`)).json<
      DeploymentView[]
    >()
    expect(history.map((d) => d.number)).toEqual([3, 2, 1])
  })

  it('deploys a push from a signed GitHub webhook', async () => {
    await api('PATCH', `/api/projects/${project.id}`, { triggerMode: 'webhook' })
    const { secret } = (await api('GET', `/api/projects/${project.id}/webhook`)).json()
    repo.write(
      'dockerfile-app/server.js',
      repo.read('dockerfile-app/server.js').replace('fixture: dockerfile-app', 'fixture: pushed'),
    )
    const sha = repo.commit('Pushed change')
    const payload = JSON.stringify({ ref: 'refs/heads/main', after: sha })
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
    const hook = await api('POST', `/api/webhooks/github/${project.id}`, payload, {
      'x-github-event': 'push',
      'x-hub-signature-256': signature,
      cookie: '',
      origin: '',
    })
    expect(hook.status).toBe(202)
    const queued = hook.json().queued as number
    const list = (await api('GET', `/api/projects/${project.id}/deployments`)).json<
      DeploymentView[]
    >()
    const pushed = await waitForDeployment(list.find((d) => d.number === queued)!.id)
    expect(pushed).toMatchObject({ status: 'ready', trigger: 'push', commitSha: sha })
    expect((await h.fetchApp(project.name)).body).toContain('fixture: pushed')
  })

  it('deploys new commits found by the poller', async () => {
    await api('PATCH', `/api/projects/${project.id}`, { triggerMode: 'poll' })
    repo.write(
      'dockerfile-app/server.js',
      repo.read('dockerfile-app/server.js').replace('fixture: pushed', 'fixture: polled'),
    )
    const sha = repo.commit('Polled change')
    await h.ctx.queue.send('poll', {})
    let polled: DeploymentView | undefined
    await eventually(async () => {
      const list = (await api('GET', `/api/projects/${project.id}/deployments`)).json<
        DeploymentView[]
      >()
      polled = list.find((d) => d.commitSha === sha)
      expect(polled).toBeDefined()
    }, 120_000)
    expect((await waitForDeployment(polled!.id)).status).toBe('ready')
    expect((await h.fetchApp(project.name)).body).toContain('fixture: polled')
  })

  it('stops and starts the app', async () => {
    expect((await api('POST', `/api/projects/${project.id}/stop`)).json().desiredState).toBe(
      'stopped',
    )
    await eventually(async () => {
      expect((await h.fetchApp(project.name)).body).toContain("This app isn't running")
    })
    expect((await api('POST', `/api/projects/${project.id}/start`)).json().desiredState).toBe(
      'running',
    )
    await eventually(async () => {
      expect((await h.fetchApp(project.name)).body).toContain('fixture: polled')
    })
  })

  it('deletes the project, its containers, and its images', async () => {
    expect((await api('DELETE', `/api/projects/${project.id}`)).status).toBe(200)
    expect(await h.ctx.docker.listManagedApps(project.id)).toEqual([])
    await eventually(async () => {
      expect((await h.fetchApp(project.name)).body).toContain("This app isn't running")
    })
  })
})
