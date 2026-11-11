// A central Hangar and a person's own server, in one process with two databases (D38): pairing
// with the install command's code, requests and live streams through the relay, the GitHub token
// asked for from the server, who may use which server, and removing a server.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import pg from 'pg'
import { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../src/app.ts'
import { loadConfig } from '../../src/config.ts'
import { createContext } from '../../src/context.ts'
import { runMigrations } from '../../src/db/migrate.ts'
import { createLogger } from '../../src/logger.ts'
import { issueSetupCode } from '../../src/modules/auth/service.ts'
import { getSettings, setSettings } from '../../src/modules/settings/repo.ts'
import { getGithubToken } from '../../src/modules/settings/secrets.ts'
import { seedSettings } from '../../src/modules/settings/service.ts'
import { startAgent } from '../../src/relay/agent.ts'
import { DEV_DATABASE_URL, devCoreEnv, REPO_ROOT } from './harness.ts'

const CENTRAL_PORT = 39517
const CENTRAL = `http://127.0.0.1:${CENTRAL_PORT}`

async function freshDatabase(name: string) {
  const admin = new pg.Client({ connectionString: DEV_DATABASE_URL })
  await admin.connect()
  await admin.query(`drop database if exists ${name} with (force)`)
  await admin.query(`create database ${name}`)
  await admin.end()
  const url = new URL(DEV_DATABASE_URL)
  url.pathname = `/${name}`
  return url.toString()
}

async function instance(name: string, extra: Record<string, string>) {
  const config = loadConfig({
    ...devCoreEnv(),
    DATABASE_URL: await freshDatabase(name),
    HANGAR_LAN_IP: '127.0.0.1',
    HANGAR_TRAEFIK_DYNAMIC_DIR: mkdtempSync(path.join(tmpdir(), `${name}-`)),
    HANGAR_MIGRATIONS_DIR: path.join(REPO_ROOT, 'apps/server/drizzle'),
    HANGAR_WEB_DIR: mkdtempSync(path.join(tmpdir(), `${name}-web-`)),
    LOG_LEVEL: 'warn',
    ...extra,
  })
  const { ctx, close } = createContext(config, createLogger({ ...config, logLevel: 'warn' }))
  await runMigrations(ctx.db.$client, config.migrationsDir)
  await seedSettings(ctx)
  return { ctx, close, app: buildApp(ctx) }
}

function localRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hangar-relay-repo-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir })
  git('init', '--quiet', '-b', 'main')
  writeFileSync(path.join(dir, 'index.html'), 'hi')
  git('add', '-A')
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init')
  return `file://${dir}`
}

const central = await instance('hangar_relay_central', { HANGAR_DEV_ORIGINS: CENTRAL })
let home: Awaited<ReturnType<typeof instance>>
let homePort = 0

interface Call {
  method?: string
  url: string
  body?: unknown
  session?: { cookie: string; csrf: string }
}

async function call({ method = 'GET', url, body, session }: Call) {
  const response = await fetch(`${CENTRAL}${url}`, {
    method,
    headers: {
      origin: CENTRAL,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('hangar_session='))
  return {
    status: response.status,
    json: () => JSON.parse(text),
    text,
    cookie: cookie?.split(';')[0],
  }
}

let owner = { cookie: '', csrf: '' }
let serverId = ''
let installCommand = ''

async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await check()) return
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

beforeAll(async () => {
  await central.app.listen({ port: CENTRAL_PORT, host: '127.0.0.1' })
  const setupCode = await issueSetupCode(central.ctx)
  const setup = await call({
    method: 'POST',
    url: '/api/setup/complete',
    body: { setupCode, username: 'pilot', password: 'a long enough password' },
  })
  owner = { cookie: setup.cookie!, csrf: setup.json().csrfToken }
})

afterAll(async () => {
  home?.ctx.central?.stop()
  await home?.app.close()
  await home?.close()
  await central.app.close()
  await central.close()
})

describe('connecting a server', () => {
  it('gives a one-time install command', async () => {
    const added = await call({
      method: 'POST',
      url: '/api/servers',
      body: { name: 'Home laptop' },
      session: owner,
    })
    expect(added.status).toBe(200)
    serverId = added.json().server.id
    installCommand = added.json().installCommand
    expect(installCommand).toMatch(
      new RegExp(`^curl -fsSL ${CENTRAL}/install.sh \\| sudo HANGAR_PAIRING_CODE=[\\w-]+ bash$`),
    )
    expect(added.json().server).toMatchObject({ name: 'Home laptop', online: false, paired: false })

    const script = await fetch(`${CENTRAL}/install.sh`).then((r) => r.text())
    expect(script).toContain(`HANGAR_CENTRAL_URL='${CENTRAL}'`)
    expect(script).toContain('sha256sum --check')
  })

  it('pairs with the code, then shows as online with what it is', async () => {
    const code = /HANGAR_PAIRING_CODE=([\w-]+)/.exec(installCommand)![1]!
    home = await instance('hangar_relay_home', {
      HANGAR_CENTRAL_URL: CENTRAL,
      HANGAR_PAIRING_CODE: code,
    })
    await home.app.listen({ port: 0, host: '127.0.0.1' })
    homePort = (home.app.server.address() as { port: number }).port
    home.ctx.central = startAgent(home.ctx, { port: homePort })

    await waitFor(async () => {
      const [server] = (await call({ url: '/api/servers', session: owner })).json()
      return server?.online && server.info !== null
    }, 'the server to connect')
    const [server] = (await call({ url: '/api/servers', session: owner })).json()
    expect(server).toMatchObject({ paired: true, online: true, info: { lanIp: '127.0.0.1' } })
    expect(server.info.cpus).toBeGreaterThan(0)

    const settings = await getSettings(home.ctx.db)
    expect(settings.central).toMatchObject({ url: CENTRAL, serverId })
    // The key is stored sealed, and the pairing code does not work a second time.
    expect(settings.central!.credential).not.toContain('Bearer')
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${CENTRAL.replace('http', 'ws')}/api/agent/connect`, {
        headers: { 'x-hangar-pairing': code },
      })
      ws.on('open', () => resolve(101))
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
      ws.on('error', () => resolve(0))
    })
    expect(status).toBe(401)
  })

  it('runs requests on the server, as the person who owns it', async () => {
    const repoUrl = localRepo()
    const created = await call({
      method: 'POST',
      url: `/api/s/${serverId}/projects`,
      body: { name: 'from-afar', repoUrl, deploy: false, hostnames: [] },
      session: owner,
    })
    expect(created.status).toBe(200)
    // The project lives on the server, not here.
    const { rows: there } = await home.ctx.db.execute(
      `select p.name, u.username from projects p join users u on u.id = p.owner_id`,
    )
    expect(there).toEqual([{ name: 'from-afar', username: 'pilot' }])
    const { rows: here } = await central.ctx.db.execute('select name from projects')
    expect(here).toEqual([])

    const listed = await call({ url: `/api/s/${serverId}/projects`, session: owner })
    expect(listed.json().map((p: { name: string }) => p.name)).toEqual(['from-afar'])
    const settings = await call({ url: `/api/s/${serverId}/settings`, session: owner })
    expect(settings.json().lanIp).toBe('127.0.0.1')
  })

  it('needs the CSRF token, like any request here', async () => {
    const res = await call({
      method: 'POST',
      url: `/api/s/${serverId}/projects`,
      body: { name: 'sneaky', repoUrl: 'https://github.com/a/b', deploy: false },
      session: { cookie: owner.cookie, csrf: 'wrong' },
    })
    expect(res.status).toBe(403)
  })

  it('streams live events from the server', async () => {
    const first = await new Promise<string>((resolve, reject) => {
      const req = request(
        `${CENTRAL}/api/s/${serverId}/events`,
        { headers: { cookie: owner.cookie } },
        (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream')
          res.setEncoding('utf8')
          let seen = ''
          res.on('data', (chunk: string) => {
            seen += chunk
            if (seen.includes('\n\n')) {
              req.destroy()
              resolve(seen)
            }
          })
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(first).toContain(': connected')
  })

  it('never relays account business', async () => {
    for (const url of ['users', 'servers', 'auth/me', 'invites', 'access']) {
      const res = await call({ url: `/api/s/${serverId}/${url}`, session: owner })
      expect([url, res.status]).toEqual([url, 404])
    }
  })

  it('gets the GitHub token from the central Hangar when it needs one', async () => {
    const { rows } = await central.ctx.db.execute(`select id from users where username = 'pilot'`)
    const pilotId = String(rows[0]!.id)
    await central.ctx.db.execute(
      `update users set github_token = '${central.ctx.crypto.seal('github_pat_pilot', `user:${pilotId}:githubToken`)}' where id = '${pilotId}'`,
    )
    const { central: link } = await getSettings(home.ctx.db)
    expect(await getGithubToken(home.ctx, link!.localUserId)).toBe('github_pat_pilot')
  })

  it('keeps other people away from it, and from this machine once they sign up', async () => {
    const githubApp = {
      id: 1,
      slug: 'hangar-relay',
      clientId: 'Iv1.x',
      clientSecret: central.ctx.crypto.seal('s', 'setting:githubApp'),
      owner: 'pilot',
      htmlUrl: 'https://github.com/apps/hangar-relay',
    }
    await setSettings(central.ctx.db, { githubApp, openSignUp: true })
    // A stranger signs up with GitHub.
    vi.spyOn(central.ctx.github, 'exchangeCode').mockResolvedValue({
      accessToken: 'ghu_stranger',
      expiresAt: null,
      refreshToken: null,
    })
    vi.spyOn(central.ctx.github, 'currentUser').mockResolvedValue({ id: 777, login: 'Stranger' })
    vi.spyOn(central.ctx.github, 'countInstallations').mockResolvedValue(1)
    const start = await fetch(`${CENTRAL}/api/auth/github/start`, {
      method: 'POST',
      headers: { origin: CENTRAL, 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'login' }),
    })
    const flow = start.headers.getSetCookie()[0]!.split(';')[0]!
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state')
    const finish = await fetch(`${CENTRAL}/api/auth/github/finish`, {
      method: 'POST',
      headers: { origin: CENTRAL, 'content-type': 'application/json', cookie: flow },
      body: JSON.stringify({ code: 'c', state }),
    })
    const body = (await finish.json()) as { session: { user: unknown; csrfToken: string } }
    expect(body.session.user).toMatchObject({ username: 'stranger', localAccess: false })
    const stranger = {
      cookie: finish.headers
        .getSetCookie()
        .find((c) => c.startsWith('hangar_session='))!
        .split(';')[0]!,
      csrf: body.session.csrfToken,
    }

    expect((await call({ url: `/api/s/${serverId}/projects`, session: stranger })).status).toBe(404)
    expect((await call({ url: '/api/servers', session: stranger })).json()).toEqual([])
    // This machine's own apps and settings are not theirs to use.
    const here = await call({ url: '/api/projects', session: stranger })
    expect(here.status).toBe(403)
    expect(here.json().error.code).toBe('own_server_only')
    expect((await call({ url: '/api/settings', session: stranger })).status).toBe(403)
    const events = await fetch(`${CENTRAL}/api/events`, { headers: { cookie: stranger.cookie } })
    expect(events.status).toBe(403)
    // Their own servers work as usual.
    const theirs = await call({
      method: 'POST',
      url: '/api/servers',
      body: { name: 'Their box' },
      session: stranger,
    })
    expect(theirs.status).toBe(200)
    vi.restoreAllMocks()
  })

  it('answers plainly while the server is away', async () => {
    home.ctx.central!.stop()
    await waitFor(
      async () => !(await call({ url: '/api/servers', session: owner })).json()[0].online,
      'the server to drop',
    )
    const res = await call({ url: `/api/s/${serverId}/projects`, session: owner })
    expect(res.status).toBe(503)
    expect(res.json().error.code).toBe('server_offline')
    home.ctx.central = startAgent(home.ctx, { port: homePort })
    await waitFor(
      async () => (await call({ url: '/api/servers', session: owner })).json()[0].online,
      'the server to come back',
    )
  })

  it('tells a removed server to forget this Hangar', async () => {
    const res = await call({ method: 'DELETE', url: `/api/servers/${serverId}`, session: owner })
    expect(res.status).toBe(200)
    await waitFor(
      async () => (await getSettings(home.ctx.db)).central === null,
      'the server to forget',
    )
    expect((await call({ url: '/api/servers', session: owner })).json()).toEqual([])
  })
})
