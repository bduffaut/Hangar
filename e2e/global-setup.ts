// Prepares the dev instance for a browser run: builds the dashboard, resets the account so the
// Preflight Checklist can run again, removes leftovers from earlier runs, and makes a local
// repository of the fixtures for the tests to deploy. Development data only.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CACHE = path.join(ROOT, '.cache/e2e')

const run = (cmd: string, args: string[], cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()

const BROWSER_CONTAINER = 'hangar-e2e-browser'
const BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.64.0-noble'
/** Hostnames the tests visit; the browser container maps them to Traefik. */
const TEST_HOSTS = ['tower', 'test-flight', 'e2e-desktop', 'e2e-phone']

/**
 * Starts the browser in Playwright's Docker image on the hangar network, so this machine needs no
 * browser libraries and the browser reaches Traefik directly.
 */
async function ensureBrowser() {
  if (run('docker', ['ps', '-q', '--filter', `name=^${BROWSER_CONTAINER}$`])) return
  try {
    run('docker', ['rm', '-f', BROWSER_CONTAINER])
  } catch {
    // Not there.
  }
  const proxyIp = run('docker', [
    'inspect',
    '-f',
    '{{(index .NetworkSettings.Networks "hangar").IPAddress}}',
    'hangar-proxy',
  ])
  const hosts = TEST_HOSTS.flatMap((h) => ['--add-host', `${h}.127-0-0-1.sslip.io:${proxyIp}`])
  run('docker', [
    'run',
    '-d',
    '--name',
    BROWSER_CONTAINER,
    '--network',
    'hangar',
    '-p',
    '127.0.0.1:3333:3333',
    '--init',
    '--ipc=host',
    ...hosts,
    BROWSER_IMAGE,
    'npx',
    '-y',
    'playwright@1.64.0',
    'run-server',
    '--port',
    '3333',
    '--host',
    '0.0.0.0',
  ])
  for (let i = 0; i < 60; i++) {
    if (run('docker', ['logs', BROWSER_CONTAINER]).includes('Listening')) return
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('The browser container did not start; see: docker logs hangar-e2e-browser')
}

export default async function globalSetup() {
  const health = await fetch('http://localhost:3000/api/health').catch(() => null)
  if (!health?.ok) throw new Error('The dev stack is not running. Start it with: pnpm dev')
  await ensureBrowser()

  run('pnpm', ['--filter', '@hangar/frontend', 'build'])

  // Remove earlier test projects through the CLI, so containers and images go too.
  for (const name of ['e2e-desktop', 'e2e-phone', 'test-flight']) {
    try {
      run('docker', [
        'exec',
        'hangar-core',
        'pnpm',
        '--silent',
        '--filter',
        '@hangar/server',
        'hangar',
        'delete',
        name,
      ])
    } catch {
      // Not there.
    }
  }

  const sql =
    "delete from users; update settings set value = 'null'::jsonb where key = 'githubToken';"
  run('docker', ['exec', 'hangar-db', 'psql', '-U', 'hangar', '-d', 'hangar', '-qc', sql])

  rmSync(CACHE, { recursive: true, force: true })
  mkdirSync(CACHE, { recursive: true })
  const code = run('docker', [
    'exec',
    'hangar-core',
    'pnpm',
    '--silent',
    '--filter',
    '@hangar/server',
    'hangar-admin',
    'issue-setup-code',
  ])
  writeFileSync(path.join(CACHE, 'setup-code'), code)

  // A local repository holding the fixtures, which core clones over file:// (development only).
  const work = path.join(CACHE, 'work')
  const bare = path.join(CACHE, 'fixtures.git')
  mkdirSync(work, { recursive: true })
  cpSync(path.join(ROOT, 'fixtures'), work, { recursive: true })
  run('git', ['init', '--quiet', '--bare', '-b', 'main', bare])
  run('git', ['config', 'uploadpack.allowAnySHA1InWant', 'true'], bare)
  run('git', ['init', '--quiet', '-b', 'main'], work)
  run('git', ['add', '-A'], work)
  run(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-qm',
      'Fixtures for browser tests',
    ],
    work,
  )
  run('git', ['push', '--quiet', bare, 'main'], work)
}
