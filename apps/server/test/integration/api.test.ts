// The API in-process against a throwaway database: setup, sign-in, sessions, CSRF and origin
// checks, validation, env vars, and webhook signatures. Needs Postgres from the dev stack.
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { contract, streams } from '@hangar/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../src/app.ts'
import { loadConfig } from '../../src/config.ts'
import { createContext } from '../../src/context.ts'
import { runMigrations } from '../../src/db/migrate.ts'
import { createLogger } from '../../src/logger.ts'
import { refreshAddresses } from '../../src/modules/addresses/service.ts'
import { issueSetupCode } from '../../src/modules/auth/service.ts'
import { insertQueuedDeployment } from '../../src/modules/deployments/repo.ts'
import { getSettings, setSettings } from '../../src/modules/settings/repo.ts'
import { getGithubToken, TUNNEL_TOKEN_AAD } from '../../src/modules/settings/secrets.ts'
import { seedSettings } from '../../src/modules/settings/service.ts'
import { redeemLink } from '../../src/modules/users/service.ts'
import { DEV_DATABASE_URL, devCoreEnv, REPO_ROOT } from './harness.ts'

const TEST_DB = 'hangar_api_test'
const ORIGIN = 'http://localhost:5173'
const HOST = 'localhost:5173'

async function recreateDatabase() {
  const admin = new pg.Client({ connectionString: DEV_DATABASE_URL })
  await admin.connect()
  await admin.query(`drop database if exists ${TEST_DB} with (force)`)
  await admin.query(`create database ${TEST_DB}`)
  await admin.end()
  const url = new URL(DEV_DATABASE_URL)
  url.pathname = `/${TEST_DB}`
  return url.toString()
}

// A stand-in for the built dashboard.
const webDir = mkdtempSync(path.join(tmpdir(), 'hangar-api-web-'))
writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Hangar</title>')
mkdirSync(path.join(webDir, 'assets'))
writeFileSync(path.join(webDir, 'assets', 'app-abc123.js'), 'console.log(1)')

const config = loadConfig({
  ...devCoreEnv(),
  HANGAR_WEB_DIR: webDir,
  DATABASE_URL: await recreateDatabase(),
  HANGAR_DEV_ORIGINS: ORIGIN,
  HANGAR_LAN_IP: '127.0.0.1',
  // Routing for this throwaway instance goes nowhere near the dev stack's Traefik.
  HANGAR_TRAEFIK_DYNAMIC_DIR: mkdtempSync(path.join(tmpdir(), 'hangar-api-test-')),
  HANGAR_MIGRATIONS_DIR: path.join(REPO_ROOT, 'apps/server/drizzle'),
  LOG_LEVEL: 'warn',
})
const { ctx, close } = createContext(config, createLogger({ ...config, logLevel: 'warn' }))
const app = buildApp(ctx)

interface Call {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  cookie?: string
  csrf?: string
  origin?: string | null
  host?: string
  headers?: Record<string, string>
}

async function call({
  method = 'GET',
  url,
  body,
  cookie,
  csrf,
  origin = ORIGIN,
  host = HOST,
  headers,
}: Call) {
  const response = await app.inject({
    method,
    url,
    payload: body as object | undefined,
    headers: {
      host,
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...headers,
    },
  })
  const setCookie = response.headers['set-cookie']
  const sessionCookie = [setCookie].flat().find((c) => c?.startsWith('hangar_session='))
  return {
    status: response.statusCode,
    json: () => response.json(),
    text: response.body,
    cookie: sessionCookie?.split(';')[0],
  }
}

/** A local repository with one commit on main; development allows file:// URLs. */
function localRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hangar-api-repo-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir })
  git('init', '--quiet', '-b', 'main')
  writeFileSync(path.join(dir, 'index.html'), 'hi')
  git('add', '-A')
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init')
  return `file://${dir}`
}
const repoUrl = localRepo()

let cookie = ''
let csrf = ''

beforeAll(async () => {
  await runMigrations(ctx.db.$client, config.migrationsDir)
  await seedSettings(ctx)
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await close()
})

describe('first-run setup', () => {
  it('reports that setup is needed', async () => {
    expect((await call({ url: '/api/setup/status' })).json()).toEqual({ needsSetup: true })
  })

  it('rejects a wrong boarding pass', async () => {
    await issueSetupCode(ctx)
    const res = await call({
      method: 'POST',
      url: '/api/setup/complete',
      body: { setupCode: 'WRONG-CODE', username: 'admin', password: 'correct horse battery' },
    })
    expect(res.status).toBe(400)
    expect(res.json().error.code).toBe('invalid_setup_code')
  })

  it('rejects a weak password', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/setup/complete',
      body: { setupCode: 'X', username: 'admin', password: 'short' },
    })
    expect(res.status).toBe(400)
    expect(res.json().error.code).toBe('invalid_input')
  })

  it('creates the account with the right code and signs in', async () => {
    const code = (await issueSetupCode(ctx))!
    expect(code).toMatch(/^([0-9A-Z]{4}-){6}[0-9A-Z]{4}$/)
    const res = await call({
      method: 'POST',
      url: '/api/setup/complete',
      // Codes are accepted in any case and without dashes.
      body: {
        setupCode: code.toLowerCase().replaceAll('-', ' '),
        username: 'Admin',
        password: 'correct horse battery',
      },
    })
    expect(res.status).toBe(200)
    expect(res.json().user.username).toBe('admin')
    expect(res.cookie).toBeDefined()
    cookie = res.cookie!
    csrf = res.json().csrfToken
  })

  it('cannot run twice', async () => {
    expect(await issueSetupCode(ctx)).toBeNull()
    expect((await call({ url: '/api/setup/status' })).json()).toEqual({ needsSetup: false })
    const res = await call({
      method: 'POST',
      url: '/api/setup/complete',
      body: { setupCode: 'ANY', username: 'intruder', password: 'correct horse battery' },
    })
    expect(res.status).toBe(409)
  })
})

describe('sessions', () => {
  it('returns the signed-in user', async () => {
    const res = await call({ url: '/api/auth/me', cookie })
    expect(res.json()).toEqual({
      user: { id: expect.any(String), username: 'admin', role: 'admin' },
      csrfToken: csrf,
    })
  })

  it('requires a session', async () => {
    expect((await call({ url: '/api/projects' })).status).toBe(401)
    expect((await call({ url: '/api/projects', cookie: 'hangar_session=forged' })).status).toBe(401)
  })

  it('requires the CSRF token on changes', async () => {
    const body = { vars: {} }
    const missing = await call({ method: 'PATCH', url: '/api/settings', body, cookie })
    expect(missing.status).toBe(403)
    expect(missing.json().error.code).toBe('bad_csrf_token')
    const wrong = await call({
      method: 'PATCH',
      url: '/api/settings',
      body,
      cookie,
      csrf: 'x' + csrf.slice(1),
    })
    expect(wrong.status).toBe(403)
  })

  it('refuses changes from other origins, even with a valid session', async () => {
    for (const origin of [null, 'http://blog.127-0-0-1.sslip.io', 'https://evil.example']) {
      const res = await call({
        method: 'PATCH',
        url: '/api/settings',
        body: {},
        cookie,
        csrf,
        origin,
      })
      expect(res.status).toBe(403)
      expect(res.json().error.code).toBe('bad_origin')
    }
  })

  it('serves the API only on Control Tower hostnames', async () => {
    const res = await call({ url: '/api/auth/me', cookie, host: 'blog.127-0-0-1.sslip.io' })
    expect(res.status).toBe(404)
    expect(res.text).toContain("This app isn't running")
    const tower = await call({ url: '/api/auth/me', cookie, host: 'tower.127-0-0-1.sslip.io' })
    expect(tower.status).toBe(200)
  })

  it('refuses the public entrypoint unless the tower is exposed', async () => {
    const res = await call({
      url: '/api/auth/me',
      cookie,
      host: 'tower.127-0-0-1.sslip.io',
      headers: { 'x-hangar-entrypoint': 'public' },
    })
    expect(res.status).toBe(404)
  })

  it('rejects a wrong password with a plain message', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'nope nope nope' },
    })
    expect(res.status).toBe(401)
    expect(res.json().error.message).toBe('The username or password is not correct.')
    const unknown = await call({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'ghost', password: 'nope nope nope' },
    })
    expect(unknown.json().error.message).toBe('The username or password is not correct.')
  })

  it('signs in and out', async () => {
    const login = await call({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'correct horse battery' },
    })
    expect(login.status).toBe(200)
    const second = { cookie: login.cookie!, csrf: login.json().csrfToken }
    expect((await call({ method: 'POST', url: '/api/auth/logout', ...second })).status).toBe(200)
    expect((await call({ url: '/api/auth/me', cookie: second.cookie })).status).toBe(401)
    // The first session is unaffected.
    expect((await call({ url: '/api/auth/me', cookie })).status).toBe(200)
  })
})

describe('dashboard layout', () => {
  const widget = { id: 'hangar.cpu', type: 'hangar.cpu', x: 0, y: 0, w: 2, h: 27 }

  it('starts with no saved layout', async () => {
    const res = await call({ url: '/api/me/dashboard', cookie })
    expect(res.json()).toEqual({ layout: null })
  })

  it('saves and returns the layout, keeping fields the grid adds', async () => {
    const layout = [
      { ...widget, collapsed: true, breakpoints: { narrow: { x: 0, y: 0, w: 2, h: 27 } } },
    ]
    const saved = await call({
      method: 'PUT',
      url: '/api/me/dashboard',
      body: { layout },
      cookie,
      csrf,
    })
    expect(saved.status).toBe(200)
    expect((await call({ url: '/api/me/dashboard', cookie })).json()).toEqual({ layout })
  })

  it('rejects malformed and oversized layouts', async () => {
    const put = (layout: unknown) =>
      call({ method: 'PUT', url: '/api/me/dashboard', body: { layout }, cookie, csrf })
    expect((await put([{ ...widget, w: -1 }])).status).toBe(400)
    expect((await put([{ id: 'x' }])).status).toBe(400)
    expect((await put('not a list')).status).toBe(400)
    const huge = [{ ...widget, props: { text: 'x'.repeat(40_000) } }]
    expect((await put(huge)).status).toBe(400)
  })
})

describe('settings', () => {
  it('never returns secrets', async () => {
    const res = await call({ url: '/api/settings', cookie })
    expect(res.json()).toEqual({
      lanIp: '127.0.0.1',
      lanDomain: '127-0-0-1.sslip.io',
      publicDomains: [],
      defaultDomain: null,
      exposeTowerPublicly: false,
      githubConnected: false,
      tunnelConfigured: false,
      towerUrl: 'http://tower.127-0-0-1.sslip.io',
    })
  })

  it('validates the public domains', async () => {
    const settings = (body: unknown) =>
      call({ method: 'PATCH', url: '/api/settings', body, cookie, csrf })
    expect((await settings({ publicDomains: ['x'] })).status).toBe(400)
    const nested = await settings({ publicDomains: ['example.com', 'apps.example.com'] })
    expect(nested.json().error.code).toBe('nested_domain')
    const saved = await settings({
      publicDomains: ['https://Example.com/', 'other.dev', 'example.com'],
    })
    expect(saved.json()).toMatchObject({
      publicDomains: ['example.com', 'other.dev'],
      defaultDomain: 'example.com',
    })
    expect((await settings({ publicDomains: [] })).json().publicDomains).toEqual([])
    const expose = await call({
      method: 'PATCH',
      url: '/api/settings',
      body: { exposeTowerPublicly: true },
      cookie,
      csrf,
    })
    expect(expose.json().error.code).toBe('no_public_domain')
  })
})

describe('projects and env vars', () => {
  let projectId = ''

  it.each([
    [{ name: 'tower', repoUrl: 'https://github.com/a/b' }, 'reserved'],
    [{ name: 'Bad Name', repoUrl: 'https://github.com/a/b' }, 'lowercase'],
    [{ name: 'ok', repoUrl: 'http://github.com/a/b' }, 'HTTPS'],
    [{ name: 'ok', repoUrl: 'https://user:pw@github.com/a/b' }, 'HTTPS'],
    [
      { name: 'ok', repoUrl: 'https://github.com/a/b', branch: '--upload-pack=x', deploy: false },
      'branch',
    ],
    [
      {
        name: 'ok',
        repoUrl: 'https://github.com/a/b',
        branch: 'main',
        rootDir: '../etc',
        deploy: false,
      },
      'root directory',
    ],
  ])('rejects %j', async (body, message) => {
    const res = await call({ method: 'POST', url: '/api/projects', body, cookie, csrf })
    expect(res.status).toBe(400)
    expect(res.json().error.message.toLowerCase()).toContain(message.toLowerCase())
  })

  it('checks the branch before saving anything', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/projects',
      body: { name: 'typo', repoUrl, branch: 'mian' },
      cookie,
      csrf,
    })
    expect(res.status).toBe(400)
    expect(res.json().error.message).toContain('"mian" was not found')
    expect((await call({ url: '/api/projects', cookie })).json()).toEqual([])
  })

  it('creates a project without deploying', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/projects',
      body: {
        name: 'blog',
        repoUrl,
        deploy: false,
      },
      cookie,
      csrf,
    })
    expect(res.status, res.text).toBe(200)
    const project = res.json()
    projectId = project.id
    expect(project).toMatchObject({
      name: 'blog',
      triggerMode: 'poll',
      url: 'http://blog.127-0-0-1.sslip.io',
      current: null,
      latest: null,
    })
    expect(project).not.toHaveProperty('webhookSecret')
    const again = await call({
      method: 'POST',
      url: '/api/projects',
      body: {
        name: 'blog',
        repoUrl,
        deploy: false,
      },
      cookie,
      csrf,
    })
    expect(again.status).toBe(409)
  })

  it('chooses public addresses on the owner domains, with name.<default> as the default', async () => {
    const settings = (body: unknown) =>
      call({ method: 'PATCH', url: '/api/settings', body, cookie, csrf })
    const patch = (body: unknown) =>
      call({ method: 'PATCH', url: `/api/projects/${projectId}`, body, cookie, csrf })
    const create = (name: string, extra: object = {}) =>
      call({
        method: 'POST',
        url: '/api/projects',
        body: { name, repoUrl, branch: 'main', deploy: false, ...extra },
        cookie,
        csrf,
      })
    await settings({ publicDomains: ['example.com', 'other.dev'] })

    // No addresses given: public at <name>.<default domain>. An empty list keeps it private.
    const auto = await create('auto')
    expect(auto.json()).toMatchObject({
      hostnames: ['auto.example.com'],
      publicUrls: ['https://auto.example.com'],
      triggerMode: 'webhook',
    })
    expect((await create('quiet', { hostnames: [] })).json().hostnames).toEqual([])

    expect((await patch({ hostnames: ['https://blog.example.com/'] })).json().hostnames).toEqual([
      'blog.example.com',
    ])
    const both = await patch({ hostnames: ['blog.example.com', 'blog.other.dev', 'other.dev'] })
    expect(both.json().hostnames).toEqual(['blog.example.com', 'blog.other.dev', 'other.dev'])

    const notMine = await patch({ hostnames: ['blog.unknown.org'] })
    expect(notMine.status).toBe(400)
    expect(notMine.json().error.message).toContain('not under one of your domains')
    expect((await patch({ hostnames: ['a.b.example.com'] })).json().error.message).toContain(
      'one level',
    )
    expect((await patch({ hostnames: ['tower.example.com'] })).status).toBe(400)
    const taken = await patch({ hostnames: ['auto.example.com'] })
    expect(taken.status).toBe(409)
    expect(taken.json().error.message).toContain('already in use by another project')

    // A domain in use cannot be removed.
    const removing = await settings({ publicDomains: ['example.com'] })
    expect(removing.status).toBe(409)
    expect(removing.json().error.message).toContain('blog still uses blog.other.dev')

    // Checks only ever go to the owner's own addresses, and need a tunnel.
    const check = (body: unknown) =>
      call({ method: 'POST', url: '/api/settings/check-address', body, cookie, csrf })
    expect((await check({ hostname: 'evil.internal' })).status).toBe(400)
    expect((await check({ hostname: 'blog.other.dev' })).json().status).toBe('no_tunnel')

    expect((await patch({ hostnames: [] })).json().hostnames).toEqual([])
    for (const name of ['auto', 'quiet']) {
      const project = (await call({ url: '/api/projects', cookie }))
        .json()
        .find((p: { name: string }) => p.name === name)
      await call({ method: 'DELETE', url: `/api/projects/${project.id}`, cookie, csrf })
    }
    await settings({ publicDomains: [] })
  })

  it('stores env vars encrypted and lists only keys', async () => {
    const put = await call({
      method: 'PUT',
      url: `/api/projects/${projectId}/env`,
      body: { vars: { API_KEY: 's3cret', DEBUG: '1' } },
      cookie,
      csrf,
    })
    expect(put.json()).toEqual({ keys: ['API_KEY', 'DEBUG'] })
    expect((await call({ url: `/api/projects/${projectId}/env`, cookie })).json()).toEqual({
      keys: ['API_KEY', 'DEBUG'],
    })
    const reveal = await call({ url: `/api/projects/${projectId}/env/API_KEY/reveal`, cookie })
    expect(reveal.json()).toEqual({ key: 'API_KEY', value: 's3cret' })
    const { rows } = await ctx.db.$client.query('select value_encrypted from env_vars')
    expect(
      rows.every((r: { value_encrypted: string }) => r.value_encrypted.startsWith('v1.')),
    ).toBe(true)
    expect(JSON.stringify(rows)).not.toContain('s3cret')
    const bad = await call({
      method: 'PUT',
      url: `/api/projects/${projectId}/env`,
      body: { vars: { 'BAD-KEY': 'x' } },
      cookie,
      csrf,
    })
    expect(bad.status).toBe(400)
  })

  it('returns 404 for unknown and malformed IDs', async () => {
    expect(
      (await call({ url: '/api/projects/0190a0a0-0000-7000-8000-000000000000', cookie })).status,
    ).toBe(404)
    expect((await call({ url: '/api/projects/not-a-uuid', cookie })).status).toBe(400)
  })

  it('verifies webhook signatures before doing anything', async () => {
    const webhook = (await call({ url: `/api/projects/${projectId}/webhook`, cookie })).json()
    expect(webhook.secret).toMatch(/^[0-9a-f]{64}$/)
    const payload = JSON.stringify({ ref: 'refs/heads/main', after: 'a'.repeat(40) })
    const sign = (secret: string) =>
      `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
    const post = (signature: string, event = 'push') =>
      app.inject({
        method: 'POST',
        url: `/api/webhooks/github/${projectId}`,
        payload,
        headers: {
          host: 'hooks.example.com',
          'x-hangar-entrypoint': 'public',
          'content-type': 'application/json',
          'x-github-event': event,
          'x-hub-signature-256': signature,
        },
      })
    expect((await post(sign('wrong'))).statusCode).toBe(401)
    expect((await post(sign(webhook.secret), 'ping')).statusCode).toBe(200)
    // Signed correctly, but the project polls instead of using webhooks.
    const ignored = await post(sign(webhook.secret))
    expect(ignored.statusCode).toBe(202)
    expect(ignored.json()).toHaveProperty('ignored')
  })

  it('deletes the project', async () => {
    expect(
      (await call({ method: 'DELETE', url: `/api/projects/${projectId}`, cookie, csrf })).status,
    ).toBe(200)
    expect((await call({ url: `/api/projects/${projectId}`, cookie })).status).toBe(404)
  })
})

describe('accounts', () => {
  const PASSWORD = 'a long enough password'
  const ADMIN_PASSWORD = 'correct horse battery'
  let member = { cookie: '', csrf: '', id: '' }
  let adminProject = ''
  let adminDeployment = ''

  const invite = async (body: object = {}) =>
    (await call({ method: 'POST', url: '/api/invites', body, cookie, csrf })).json().token as string

  async function join(token: string, username: string, password = PASSWORD) {
    const res = await call({
      method: 'POST',
      url: '/api/auth/link/redeem',
      body: { token, username, password },
    })
    const body = res.json()
    return { res, cookie: res.cookie ?? '', csrf: body.csrfToken as string, id: body.user?.id }
  }

  it('has no way to sign up without an invite', async () => {
    const res = await join('made-up-token', 'stranger')
    expect(res.res.status).toBe(400)
    expect(res.res.json().error.code).toBe('invalid_link')
  })

  it('creates a member from a one-time invite', async () => {
    const token = await invite({ label: 'for a friend' })
    const open = (await call({ url: '/api/invites', cookie })).json()
    expect(open).toHaveLength(1)
    // The list never holds the link itself: only its hash is stored.
    expect(JSON.stringify(open)).not.toContain(token)
    expect(
      (await call({ method: 'POST', url: '/api/auth/link/check', body: { token } })).json(),
    ).toEqual({ valid: true, kind: 'invite', username: null })

    const joined = await join(token, 'member')
    expect(joined.res.status).toBe(200)
    expect(joined.res.json().user.role).toBe('member')
    member = { cookie: joined.cookie, csrf: joined.csrf, id: joined.id }

    expect((await join(token, 'second')).res.json().error.code).toBe('invalid_link')
    expect((await call({ url: '/api/invites', cookie })).json()).toHaveLength(0)
  })

  it('keeps an invite usable when the username is taken, and honours its role', async () => {
    const token = await invite({ role: 'admin' })
    expect((await join(token, 'member')).res.status).toBe(409)
    const second = await join(token, 'second-admin')
    expect(second.res.json().user.role).toBe('admin')
    await call({
      method: 'DELETE',
      url: `/api/users/${second.id}`,
      cookie,
      csrf,
    })
  })

  it('refuses expired and revoked invites', async () => {
    const revoked = await invite()
    const [open] = (await call({ url: '/api/invites', cookie })).json()
    await call({ method: 'DELETE', url: `/api/invites/${open.id}`, cookie, csrf })
    expect((await join(revoked, 'revoked')).res.status).toBe(400)

    const expired = await invite()
    await ctx.db.execute(`update access_links set expires_at = now() - interval '1 minute'`)
    expect((await join(expired, 'expired')).res.status).toBe(400)
  })

  it('stores passwords with strong argon2id settings', async () => {
    const { rows } = await ctx.db.execute(`select password_hash from users where username='member'`)
    expect(String(rows[0]!.password_hash)).toContain('$argon2id$')
    expect(String(rows[0]!.password_hash)).toContain('m=19456,t=2,p=1')
  })

  it('hides every project and deployment of another account behind the same 404', async () => {
    const created = await call({
      method: 'POST',
      url: '/api/projects',
      body: { name: 'admins-app', repoUrl, deploy: false, hostnames: [] },
      cookie,
      csrf,
    })
    adminProject = created.json().id
    const { deployment } = await insertQueuedDeployment(ctx.db, {
      projectId: adminProject,
      commitSha: 'a'.repeat(40),
      branch: 'main',
      trigger: 'manual',
    })
    adminDeployment = deployment.id

    const body = { hostnames: [], vars: {} }
    const scoped = [
      ...Object.values(contract).filter((e) => e.access === 'session' && e.path.includes(':id')),
      { method: 'GET', path: streams.runtimeLogs },
      { method: 'GET', path: streams.deploymentLogs },
    ]
    expect(scoped.length).toBeGreaterThan(15)
    for (const endpoint of scoped) {
      const id = endpoint.path.includes('/deployments/') ? adminDeployment : adminProject
      const res = await call({
        method: endpoint.method as 'GET',
        url: endpoint.path.replace(':id', id).replace(':key', 'KEY'),
        ...(endpoint.method === 'GET' ? {} : { body }),
        cookie: member.cookie,
        csrf: member.csrf,
      })
      expect([endpoint.path, res.status]).toEqual([endpoint.path, 404])
    }
    expect((await call({ url: '/api/projects', cookie: member.cookie })).json()).toEqual([])
    // Still there, untouched, for its owner.
    expect((await call({ url: `/api/projects/${adminProject}`, cookie })).status).toBe(200)
  })

  it('keeps every admin endpoint from members', async () => {
    const admin = Object.values(contract).filter((e) => e.access === 'admin')
    expect(admin.length).toBeGreaterThan(8)
    for (const endpoint of admin) {
      const res = await call({
        method: endpoint.method as 'GET',
        url: endpoint.path.replace(':id', member.id),
        ...(endpoint.method === 'GET' ? {} : { body: {} }),
        cookie: member.cookie,
        csrf: member.csrf,
      })
      expect([endpoint.path, res.status]).toEqual([endpoint.path, 403])
    }
  })

  it('does not show one account another account deployments on the live stream', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as { port: number }
    const firstEvent = (sessionCookie: string) =>
      new Promise<string>((resolve, reject) => {
        const req = request(
          { port, path: '/api/events', headers: { host: HOST, cookie: sessionCookie } },
          (res) => {
            let text = ''
            res.on('data', (chunk) => {
              text += chunk
              if (text.includes('event: snapshot')) {
                req.destroy()
                resolve(text)
              }
            })
          },
        )
        req.on('error', reject)
        req.end()
      })
    expect(await firstEvent(cookie)).toContain(adminDeployment)
    expect(await firstEvent(member.cookie)).not.toContain(adminDeployment)
  })

  it('gives each account its own GitHub token', async () => {
    const { rows } = await ctx.db.execute(`select id from users where username = 'admin'`)
    const adminId = String(rows[0]!.id)
    await ctx.db.execute(
      `update users set github_token = '${ctx.crypto.seal('admin-token', `user:${adminId}:githubToken`)}' where id = '${adminId}'`,
    )
    expect(await getGithubToken(ctx, adminId)).toBe('admin-token')
    expect(await getGithubToken(ctx, member.id)).toBeNull()
    expect((await call({ url: '/api/settings', cookie })).json().githubConnected).toBe(true)
    const theirs = await call({ url: '/api/settings', cookie: member.cookie })
    expect(theirs.json().githubConnected).toBe(false)
    expect((await call({ url: '/api/github/repos', cookie: member.cookie })).status).toBe(409)
  })

  it('moves the old shared GitHub token to the first admin on start', async () => {
    const { rows } = await ctx.db.execute(`select id from users where username = 'admin'`)
    await setSettings(ctx.db, { githubToken: ctx.crypto.seal('shared', 'setting:githubToken') })
    await seedSettings(ctx)
    expect(await getGithubToken(ctx, String(rows[0]!.id))).toBe('shared')
    expect(await getGithubToken(ctx, member.id)).toBeNull()
    expect((await getSettings(ctx.db)).githubToken).toBeNull()
  })

  it('keeps project limits and addresses on members', async () => {
    await setSettings(ctx.db, { publicDomains: ['example.com'] })
    const create = (body: object) =>
      call({
        method: 'POST',
        url: '/api/projects',
        body: { name: 'mine', repoUrl, deploy: false, ...body },
        cookie: member.cookie,
        csrf: member.csrf,
      })
    expect((await create({ hostnames: ['example.com'] })).status).toBe(400)
    expect((await create({ hostnames: ['www.example.com'] })).status).toBe(400)
    const internal = await create({ repoUrl: 'https://hangar-db/repo', hostnames: [] })
    expect(internal.status).toBe(400)
    const mine = await create({ hostnames: ['mine.example.com'] })
    expect(mine.status).toBe(200)
    // A taken address says nothing about who has it.
    const taken = await call({
      method: 'PATCH',
      url: `/api/projects/${adminProject}`,
      body: { hostnames: ['mine.example.com'] },
      cookie,
      csrf,
    })
    expect(taken.status).toBe(409)
    expect(taken.json().error.message).not.toContain('mine.example.com is already used by mine')
  })

  it('shows what a real request to an address found, and pushes nothing it did not see', async () => {
    const [mine] = (await call({ url: '/api/projects', cookie: member.cookie })).json()
    expect(mine.addresses[0].status).toBe('checking')
    await ctx.db.execute(`update projects set desired_state = 'stopped' where id = '${mine.id}'`)
    await refreshAddresses(ctx, mine.id)
    const stopped = (await call({ url: `/api/projects/${mine.id}`, cookie: member.cookie })).json()
    // Nothing is deployed, so no request is needed to know the app cannot answer.
    expect(stopped.addresses[0]).toMatchObject({ status: 'not_running', lastLiveAt: null })

    await ctx.db.execute(
      `update projects set desired_state = 'running', current_deployment_id = '${adminDeployment}' where id = '${mine.id}'`,
    )
    await setSettings(ctx.db, {
      cloudflareTunnelToken: ctx.crypto.seal('tunnel-token', TUNNEL_TOKEN_AAD),
    })
    let appStatus = 200
    const fetchStub = vi.fn(async (input: string) => {
      const url = new URL(input)
      if (url.pathname.startsWith('/.well-known/hangar-check/')) {
        // Answered by core's own handler, as Cloudflare and the tunnel would deliver it.
        const res = await app.inject({
          url: url.pathname,
          headers: { host: url.host, 'x-hangar-entrypoint': 'public' },
        })
        return new Response(res.body, { status: res.statusCode })
      }
      return new Response('app', { status: appStatus })
    })
    vi.stubGlobal('fetch', fetchStub)
    try {
      const statusAfter = async () => {
        await refreshAddresses(ctx, mine.id)
        return (await call({ url: `/api/projects/${mine.id}`, cookie: member.cookie })).json()
          .addresses[0]
      }
      const live = await statusAfter()
      expect(live.status).toBe('live')
      expect(live.lastLiveAt).not.toBeNull()
      expect(fetchStub).toHaveBeenCalledTimes(2)

      appStatus = 502
      const down = await statusAfter()
      expect(down.status).toBe('app_down')
      expect(down.lastLiveAt).toBe(live.lastLiveAt)

      fetchStub.mockImplementation(async () => new Response('another server', { status: 200 }))
      expect((await statusAfter()).status).toBe('elsewhere')

      fetchStub.mockImplementation(async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
      })
      expect((await statusAfter()).status).toBe('unreachable')
    } finally {
      vi.unstubAllGlobals()
      await setSettings(ctx.db, { cloudflareTunnelToken: null })
      await ctx.db.execute(
        `update projects set current_deployment_id = null where id = '${mine.id}'`,
      )
    }
  })

  it('changes a password only with the current one, ending other sessions', async () => {
    const other = await call({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'member', password: PASSWORD },
    })
    const change = (currentPassword: string) =>
      call({
        method: 'POST',
        url: '/api/me/password',
        body: { currentPassword, newPassword: 'a different long password' },
        cookie: member.cookie,
        csrf: member.csrf,
      })
    expect((await change('wrong')).status).toBe(400)
    const changed = await change(PASSWORD)
    expect(changed.status).toBe(200)
    expect((await call({ url: '/api/auth/me', cookie: other.cookie })).status).toBe(401)
    expect((await call({ url: '/api/auth/me', cookie: member.cookie })).status).toBe(401)
    member.cookie = changed.cookie!
    member.csrf = changed.json().csrfToken
    expect((await call({ url: '/api/auth/me', cookie: member.cookie })).status).toBe(200)
  })

  it('resets a password from an admin link, once, and signs the account out', async () => {
    const link = await call({
      method: 'POST',
      url: `/api/users/${member.id}/reset-link`,
      cookie,
      csrf,
    })
    const { token } = link.json()
    expect(
      (await call({ method: 'POST', url: '/api/auth/link/check', body: { token } })).json(),
    ).toEqual({ valid: true, kind: 'reset', username: 'member' })
    const redeem = () =>
      call({
        method: 'POST',
        url: '/api/auth/link/redeem',
        body: { token, password: PASSWORD },
      })
    const reset = await redeem()
    expect(reset.status).toBe(200)
    expect((await call({ url: '/api/auth/me', cookie: member.cookie })).status).toBe(401)
    expect((await redeem()).status).toBe(400)
    member.cookie = reset.cookie!
    member.csrf = reset.json().csrfToken
  })

  it('always keeps an admin', async () => {
    const { rows } = await ctx.db.execute(`select id from users where username = 'admin'`)
    const adminId = String(rows[0]!.id)
    const demote = await call({
      method: 'PATCH',
      url: `/api/users/${adminId}`,
      body: { role: 'member' },
      cookie,
      csrf,
    })
    expect(demote.json().error.code).toBe('last_admin')
    const self = await call({ method: 'DELETE', url: `/api/users/${adminId}`, cookie, csrf })
    expect(self.json().error.code).toBe('cannot_delete_self')
  })

  it('cancels the links of a demoted admin, so they cannot buy their way back', async () => {
    const second = await join(await invite({ role: 'admin' }), 'temporary-admin')
    const asSecond = { cookie: second.cookie, csrf: second.csrf }
    const heldInvite = await call({
      method: 'POST',
      url: '/api/invites',
      body: { role: 'admin' },
      ...asSecond,
    })
    const heldReset = await call({
      method: 'POST',
      url: `/api/users/${member.id}/reset-link`,
      ...asSecond,
    })
    await call({
      method: 'PATCH',
      url: `/api/users/${second.id}`,
      body: { role: 'member' },
      cookie,
      csrf,
    })
    // Directly, not over HTTP: this suite has used up the route's per-minute limit by now.
    const redeem = (token: string, username?: string) =>
      redeemLink(ctx, { token, username, password: PASSWORD })
    await expect(redeem(heldInvite.json().token, 'way-back')).rejects.toThrow('expired')
    await expect(redeem(heldReset.json().token)).rejects.toThrow('expired')
    await call({ method: 'DELETE', url: `/api/users/${second.id}`, cookie, csrf })
  })

  it('applies a role change at once', async () => {
    const promote = (role: string) =>
      call({ method: 'PATCH', url: `/api/users/${member.id}`, body: { role }, cookie, csrf })
    expect((await promote('admin')).json().role).toBe('admin')
    expect((await call({ url: '/api/users', cookie: member.cookie })).status).toBe(200)
    await promote('member')
    expect((await call({ url: '/api/users', cookie: member.cookie })).status).toBe(403)
  })

  it('removes an account with its projects and sessions', async () => {
    const before = (await call({ url: '/api/users', cookie })).json()
    expect(before.find((u: { id: string }) => u.id === member.id).projectCount).toBe(1)
    const removed = await call({ method: 'DELETE', url: `/api/users/${member.id}`, cookie, csrf })
    expect(removed.status).toBe(200)
    expect((await call({ url: '/api/auth/me', cookie: member.cookie })).status).toBe(401)
    const { rows } = await ctx.db.execute(
      `select count(*)::int as n from projects where name='mine'`,
    )
    expect(rows[0]!.n).toBe(0)
    await setSettings(ctx.db, { publicDomains: [] })
    await call({ method: 'DELETE', url: `/api/projects/${adminProject}`, cookie, csrf })
  })

  it('uses a __Host- cookie and HSTS on the public HTTPS address', async () => {
    await setSettings(ctx.db, { publicDomains: ['example.com'], exposeTowerPublicly: true })
    const headers = {
      host: 'tower.example.com',
      origin: 'https://tower.example.com',
      'x-hangar-entrypoint': 'public',
      'content-type': 'application/json',
    }
    await new Promise((resolve) => setTimeout(resolve, 5_100)) // the access policy cache
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { username: 'admin', password: ADMIN_PASSWORD },
    })
    expect(login.statusCode).toBe(200)
    const cookieHeader = String([login.headers['set-cookie']].flat()[0])
    expect(cookieHeader).toMatch(/^__Host-hangar_session=/)
    expect(cookieHeader).toContain('Secure')
    expect(cookieHeader).toContain('HttpOnly')
    expect(login.headers['strict-transport-security']).toBeDefined()
    // The name the LAN uses means nothing here, so a planted cookie gets nowhere.
    const value = cookieHeader.split(';')[0]!.split('=').slice(1).join('=')
    const planted = await app.inject({
      url: '/api/auth/me',
      headers: { ...headers, cookie: `hangar_session=${value}` },
    })
    expect(planted.statusCode).toBe(401)
    await setSettings(ctx.db, { publicDomains: [], exposeTowerPublicly: false })
  })
})

describe('serving the dashboard', () => {
  it('serves pages, assets, and security headers on the tower hostname', async () => {
    const page = await call({ url: '/projects/blog' })
    expect(page.status).toBe(200)
    expect(page.text).toContain('<title>Hangar</title>')
    const asset = await app.inject({ url: '/assets/app-abc123.js', headers: { host: HOST } })
    expect(asset.headers['cache-control']).toContain('immutable')
    expect(asset.headers['content-security-policy']).toContain("script-src 'self'")
    expect(asset.headers['x-frame-options']).toBe('DENY')
  })

  it('answers a missing build file with 404, not the page', async () => {
    const missing = await call({ url: '/assets/OldChunk-123.js' })
    expect(missing.status).toBe(404)
    expect(missing.text).not.toContain('<title>Hangar</title>')
  })

  it('never serves the dashboard on an app hostname', async () => {
    const res = await call({ url: '/', host: 'blog.127-0-0-1.sslip.io' })
    expect(res.text).toContain("This app isn't running")
  })
})
