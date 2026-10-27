// Integration tests drive the real dev stack (`pnpm dev`) from the host: they queue deployments in
// the dev database, the worker inside hangar-core runs them, and the tests check the results
// through Traefik on port 80, exactly as a browser would.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { appHostname, isTerminal } from '@hangar/shared'
import { parse } from 'yaml'
import { loadConfig } from '../../src/config.ts'
import { createContext } from '../../src/context.ts'
import { createLogger } from '../../src/logger.ts'
import { type Deployment, getDeployment } from '../../src/modules/deployments/repo.ts'
import { deleteProject, insertProject, type Project } from '../../src/modules/projects/repo.ts'
import { getSettings } from '../../src/modules/settings/repo.ts'

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..')
/** Where hangar-core sees the repository (docker/compose.dev.yml bind mount). */
const CONTAINER_REPO_ROOT = '/repo'

/** Same secrets as hangar-core, so env vars sealed here open there. */
function devCoreEnv(): Record<string, string> {
  const compose = parse(readFileSync(path.join(REPO_ROOT, 'docker/compose.dev.yml'), 'utf8'))
  return compose.services['hangar-core'].environment
}

export function createHarness() {
  const coreEnv = devCoreEnv()
  const config = loadConfig({
    ...coreEnv,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://hangar:hangar@localhost:5432/hangar',
  })
  const { ctx, close } = createContext(config, createLogger({ ...config, logLevel: 'warn' }))
  const runId = Date.now().toString(36).slice(-5)
  const projects: Project[] = []

  return {
    ctx,
    runId,

    async start() {
      const healthy = await fetch('http://localhost:3000/api/health').catch(() => null)
      if (!healthy?.ok) throw new Error('The dev stack is not running. Start it with: pnpm dev')
      await ctx.queue.start()
    },

    async createProject(name: string, values: Partial<Project> & { repoUrl: string }) {
      const project = await insertProject(ctx.db, {
        name: `it-${runId}-${name}`,
        branch: 'main',
        triggerMode: 'manual',
        ...values,
      })
      projects.push(project)
      return project
    },

    async waitForEnd(deployment: Deployment, timeoutMs = 600_000): Promise<Deployment> {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const current = (await getDeployment(ctx.db, deployment.id))!
        if (isTerminal(current.status)) return current
        await sleep(500)
      }
      throw new Error(`Deployment #${deployment.number} did not finish in time`)
    },

    async waitForStatus(deployment: Deployment, status: string, timeoutMs = 120_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const current = (await getDeployment(ctx.db, deployment.id))!
        if (current.status === status) return current
        if (isTerminal(current.status)) throw new Error(`Deployment ended as ${current.status}`)
        await sleep(250)
      }
      throw new Error(`Deployment #${deployment.number} never reached ${status}`)
    },

    /** GET / for an app through Traefik on port 80. */
    async fetchApp(projectName: string): Promise<{ status: number; body: string }> {
      const { lanDomain } = await getSettings(ctx.db)
      const host = appHostname(projectName, lanDomain!)
      return new Promise((resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port: 80, path: '/', headers: { host } },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
          },
        )
        req.on('error', reject)
        req.end()
      })
    },

    async close() {
      for (const project of projects) {
        for (const container of await ctx.docker.listManagedApps(project.id)) {
          await ctx.docker.removeContainer(container.id)
        }
        for (const tag of await ctx.docker.listTags(`hangar/${project.name}`)) {
          await ctx.docker.removeImage(tag).catch(() => {})
        }
        await deleteProject(ctx.db, project.id)
      }
      await ctx.queue.send('reconcile', {})
      await close()
    },
  }
}

/**
 * A throwaway git repository holding the fixtures, inside the repo's `.cache/` so hangar-core can
 * clone it over file://. `commit` snapshots the working tree and returns the commit SHA.
 */
export function createFixtureRepo(runId: string) {
  const root = path.join(REPO_ROOT, '.cache', `it-${runId}`)
  const bare = path.join(root, 'fixtures.git')
  const work = path.join(root, 'work')
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

  rmSync(root, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  git(root, 'init', '--quiet', '--bare', bare)
  // The pipeline fetches exact commits, which GitHub allows; a local repo needs opting in.
  git(bare, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
  git(work, 'init', '--quiet', '-b', 'main')
  cpSync(path.join(REPO_ROOT, 'fixtures'), work, { recursive: true })

  return {
    url: `file://${CONTAINER_REPO_ROOT}/${path.relative(REPO_ROOT, bare)}`,
    write(file: string, content: string) {
      mkdirSync(path.dirname(path.join(work, file)), { recursive: true })
      writeFileSync(path.join(work, file), content)
    },
    read(file: string) {
      return readFileSync(path.join(work, file), 'utf8')
    },
    commit(message: string): string {
      git(work, 'add', '-A')
      git(
        work,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '-qm',
        message,
      )
      git(work, 'push', '--quiet', '--force', bare, 'main')
      return git(work, 'rev-parse', 'HEAD')
    },
    remove() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

/** Retries `check` until it stops throwing, for state that settles shortly after an event. */
export async function eventually(check: () => Promise<void>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await check()
    } catch (error) {
      if (Date.now() > deadline) throw error
      await sleep(500)
    }
  }
}

export function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}
