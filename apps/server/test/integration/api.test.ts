// The API in-process against a throwaway database: setup, sign-in, sessions, CSRF and origin
// checks, validation, env vars, and webhook signatures. Needs Postgres from the dev stack.
import { createHmac } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.ts'
import { loadConfig } from '../../src/config.ts'
import { createContext } from '../../src/context.ts'
import { runMigrations } from '../../src/db/migrate.ts'
import { createLogger } from '../../src/logger.ts'
import { issueSetupCode } from '../../src/modules/auth/service.ts'
import { seedSettings } from '../../src/modules/settings/service.ts'
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

const config = loadConfig({
  ...devCoreEnv(),
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
      user: { id: expect.any(String), username: 'admin' },
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

describe('settings', () => {
  it('never returns secrets', async () => {
    const res = await call({ url: '/api/settings', cookie })
    expect(res.json()).toEqual({
      lanIp: '127.0.0.1',
      lanDomain: '127-0-0-1.sslip.io',
      publicDomain: null,
      exposeTowerPublicly: false,
      githubConnected: false,
      tunnelConfigured: false,
      towerUrl: 'http://tower.127-0-0-1.sslip.io',
    })
  })

  it('validates the public domain', async () => {
    const res = await call({
      method: 'PATCH',
      url: '/api/settings',
      body: { publicDomain: 'https://x' },
      cookie,
      csrf,
    })
    expect(res.status).toBe(400)
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

  it('creates a project without deploying', async () => {
    const res = await call({
      method: 'POST',
      url: '/api/projects',
      body: {
        name: 'blog',
        repoUrl: 'https://github.com/example/blog',
        branch: 'main',
        deploy: false,
      },
      cookie,
      csrf,
    })
    expect(res.status).toBe(200)
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
        repoUrl: 'https://github.com/example/blog',
        branch: 'main',
        deploy: false,
      },
      cookie,
      csrf,
    })
    expect(again.status).toBe(409)
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
