// Development CLI for driving the pipeline before the API exists. Runs inside hangar-core:
//   pnpm hangar <command> ...   (from the repo root; see `pnpm hangar help`)
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { appHostname, checkProjectName, isTerminal } from '@hangar/shared'
import { loadConfig } from '../src/config.ts'
import { createContext } from '../src/context.ts'
import { createLogger } from '../src/logger.ts'
import {
  type Deployment,
  getDeployment,
  getDeploymentByNumber,
  listDeployments,
  listLogs,
} from '../src/modules/deployments/repo.ts'
import {
  queueDeployment,
  queueRollback,
  requestCancel,
} from '../src/modules/deployments/service.ts'
import { setEnv } from '../src/modules/env-vars/service.ts'
import {
  getProjectByName,
  insertProject,
  listProjects,
  type Project,
  updateProject,
} from '../src/modules/projects/repo.ts'
import { getSettings } from '../src/modules/settings/repo.ts'
import { getGithubToken } from '../src/modules/settings/service.ts'

const USAGE = `Usage: pnpm hangar <command>

  projects                                  List projects
  add <name> <repo-url> [--branch main] [--root dir] [--port n] [--memory mb]
  set <name> [--branch b] [--root dir] [--port n|auto] [--memory mb]
  env <name> KEY=value ...                  Replace all env vars (applies on next deploy)
  deploy <name> [--sha sha] [--detach]      Build and deploy the branch head (or a commit)
  rollback <name> <number> [--detach]       Redeploy an earlier deployment's image
  cancel <name>                             Cancel the project's queued or building deployment
  history <name>                            Recent deployments
  logs <name> [number]                      Build log of a deployment (default: latest)
  reconcile | gc                            Queue a reconcile or cleanup run`

const config = loadConfig(process.env)
const { ctx, close } = createContext(config, createLogger({ ...config, logLevel: 'warn' }))
await ctx.queue.start()

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    branch: { type: 'string' },
    root: { type: 'string' },
    port: { type: 'string' },
    memory: { type: 'string' },
    sha: { type: 'string' },
    detach: { type: 'boolean' },
  },
})
const [command, ...args] = positionals

async function project(name: string | undefined): Promise<Project> {
  const found = name ? await getProjectByName(ctx.db, name) : null
  if (!found) throw new Error(`No project named "${name ?? ''}". Run: pnpm hangar projects`)
  return found
}

function describe(d: Deployment): string {
  const sha = d.commitSha.slice(0, 7)
  const failure = d.failureCode ? ` (${d.failureCode})` : ''
  const message = d.commitMessage ? `  ${d.commitMessage}` : ''
  return `#${d.number}  ${d.status}${failure}  ${sha}  ${d.trigger}${message}`
}

/** Prints the build log as it is written, until the deployment finishes. */
async function follow(deployment: Deployment): Promise<Deployment> {
  let seq = -1
  for (;;) {
    for (const row of await listLogs(ctx.db, deployment.id, seq)) {
      console.log(row.stream === 'system' ? `▸ ${row.line}` : row.line)
      seq = row.seq
    }
    const current = (await getDeployment(ctx.db, deployment.id))!
    if (isTerminal(current.status)) {
      await sleep(300) // the last log batch lands just after the status change
      for (const row of await listLogs(ctx.db, deployment.id, seq)) {
        console.log(row.stream === 'system' ? `▸ ${row.line}` : row.line)
      }
      return current
    }
    await sleep(500)
  }
}

async function finish(p: Project, deployment: Deployment): Promise<void> {
  console.log(`Queued deployment #${deployment.number}`)
  if (flags.detach) return
  const done = await follow(deployment)
  console.log(`\n${describe(done)}`)
  if (done.failureReason) console.log(done.failureReason)
  if (done.status === 'ready') {
    const { lanDomain } = await getSettings(ctx.db)
    if (lanDomain) console.log(`http://${appHostname(p.name, lanDomain)}`)
  }
  if (done.status !== 'ready') process.exitCode = 1
}

function parsePort(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined
  if (value === 'auto') return null
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${value}`)
  return port
}

function parseMemory(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const mb = Number(value)
  if (!Number.isInteger(mb) || mb < 64) throw new Error(`Invalid memory limit: ${value}`)
  return mb
}

try {
  switch (command) {
    case 'projects': {
      for (const p of await listProjects(ctx.db)) {
        console.log(
          `${p.name}  ${p.repoUrl}#${p.branch}  root=${p.rootDir || '.'}  ${p.desiredState}`,
        )
      }
      break
    }
    case 'add': {
      const [name, repoUrl] = args
      if (!name || !repoUrl) throw new Error(USAGE)
      const problem = checkProjectName(name)
      if (problem) throw new Error(`Invalid project name "${name}": ${problem}`)
      await insertProject(ctx.db, {
        name,
        repoUrl,
        branch: flags.branch ?? 'main',
        rootDir: flags.root ?? '',
        port: parsePort(flags.port) ?? null,
        memoryLimitMb: parseMemory(flags.memory),
        triggerMode: 'manual',
      })
      console.log(`Added ${name}. Deploy it with: pnpm hangar deploy ${name}`)
      break
    }
    case 'set': {
      const p = await project(args[0])
      await updateProject(ctx.db, p.id, {
        branch: flags.branch,
        rootDir: flags.root,
        port: parsePort(flags.port),
        memoryLimitMb: parseMemory(flags.memory),
      })
      console.log(`Updated ${p.name}`)
      break
    }
    case 'env': {
      const p = await project(args[0])
      const vars = Object.fromEntries(
        args.slice(1).map((pair) => {
          const at = pair.indexOf('=')
          if (at < 1) throw new Error(`Expected KEY=value, got "${pair}"`)
          return [pair.slice(0, at), pair.slice(at + 1)]
        }),
      )
      await setEnv(ctx, p.id, vars)
      console.log(`Set ${Object.keys(vars).length} env var(s) on ${p.name}`)
      break
    }
    case 'deploy': {
      const p = await project(args[0])
      const sha =
        flags.sha ?? (await ctx.git.headOf(p.repoUrl, p.branch, await getGithubToken(ctx)))
      if (!sha) throw new Error(`Branch "${p.branch}" was not found in ${p.repoUrl}`)
      await finish(p, await queueDeployment(ctx, p, { commitSha: sha, trigger: 'manual' }))
      break
    }
    case 'rollback': {
      const p = await project(args[0])
      const source = await getDeploymentByNumber(ctx.db, p.id, Number(args[1]))
      if (!source) throw new Error(`${p.name} has no deployment #${args[1]}`)
      await finish(p, await queueRollback(ctx, source))
      break
    }
    case 'cancel': {
      const p = await project(args[0])
      const [active] = (await listDeployments(ctx.db, p.id, 5)).filter((d) => !isTerminal(d.status))
      if (!active) throw new Error(`${p.name} has nothing to cancel`)
      await requestCancel(ctx, active.id)
      console.log(`Cancel requested for #${active.number}`)
      break
    }
    case 'history': {
      const p = await project(args[0])
      for (const d of await listDeployments(ctx.db, p.id, 10)) {
        const live = d.id === p.currentDeploymentId ? '  ← live' : ''
        console.log(describe(d) + live)
      }
      break
    }
    case 'logs': {
      const p = await project(args[0])
      const d = args[1]
        ? await getDeploymentByNumber(ctx.db, p.id, Number(args[1]))
        : (await listDeployments(ctx.db, p.id, 1))[0]
      if (!d) throw new Error(`${p.name} has no such deployment`)
      for (const row of await listLogs(ctx.db, d.id)) {
        console.log(row.stream === 'system' ? `▸ ${row.line}` : row.line)
      }
      console.log(`\n${describe(d)}`)
      if (d.failureReason) console.log(d.failureReason)
      break
    }
    case 'reconcile':
    case 'gc': {
      await ctx.queue.send(command, {})
      console.log(`Queued ${command}`)
      break
    }
    default:
      console.log(USAGE)
      if (command && command !== 'help') process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await close()
}
