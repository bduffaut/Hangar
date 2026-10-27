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

export default async function globalSetup() {
  const health = await fetch('http://localhost:3000/api/health').catch(() => null)
  if (!health?.ok) throw new Error('The dev stack is not running. Start it with: pnpm dev')

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
