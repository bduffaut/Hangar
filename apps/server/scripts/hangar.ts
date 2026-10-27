// Development CLI for driving the pipeline before the API exists. Runs inside hangar-core:
//   pnpm hangar <command> ...   (from the repo root; see `pnpm hangar help`)
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { appHostname, isTerminal } from '@hangar/shared'
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
  cancelActive,
  queueBranchHead,
  queueDeployment,
  queueRollback,
} from '../src/modules/deployments/service.ts'
import { setEnv } from '../src/modules/env-vars/service.ts'
import { getProjectByName, listProjects, type Project } from '../src/modules/projects/repo.ts'
import {
  createProject,
  deleteProject,
  updateProjectSettings,
} from '../src/modules/projects/service.ts'
import { getSettings } from '../src/modules/settings/repo.ts'

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
  delete <name>                             Delete a project, its containers, and its images
  reconcile | gc                            Queue a reconcile or cleanup run`

const config = loadConfig(process.env)
const { ctx, close } = createContext(config, createLogger({ ...config, logLevel: 'warn' }))

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

/** Prints log lines after `seq`; returns the last sequence number printed. */
async function printLogs(deploymentId: string, seq = -1): Promise<number> {
  for (const row of await listLogs(ctx.db, deploymentId, seq)) {
    console.log(row.stream === 'system' ? `▸ ${row.line}` : row.line)
    seq = row.seq
  }
  return seq
}

/** Prints the build log as it is written, until the deployment finishes. */
async function follow(deployment: Deployment): Promise<Deployment> {
  let seq = -1
  for (;;) {
    // Read the status first: the pipeline saves every log line before the final status.
    const current = (await getDeployment(ctx.db, deployment.id))!
    seq = await printLogs(deployment.id, seq)
    if (isTerminal(current.status)) return current
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
  return value === undefined ? undefined : value === 'auto' ? null : Number(value)
}

function parseMemory(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value)
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
      await createProject(ctx, {
        name,
        repoUrl,
        triggerMode: 'manual',
        branch: flags.branch,
        rootDir: flags.root,
        port: parsePort(flags.port),
        memoryLimitMb: parseMemory(flags.memory),
      })
      console.log(`Added ${name}. Deploy it with: pnpm hangar deploy ${name}`)
      break
    }
    case 'set': {
      const p = await project(args[0])
      await updateProjectSettings(ctx, p, {
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
      const deployment = flags.sha
        ? await queueDeployment(ctx, p, { commitSha: flags.sha, trigger: 'manual' })
        : await queueBranchHead(ctx, p, 'manual')
      await finish(p, deployment)
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
      const active = await cancelActive(ctx, await project(args[0]))
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
      await printLogs(d.id)
      console.log(`\n${describe(d)}`)
      if (d.failureReason) console.log(d.failureReason)
      break
    }
    case 'delete': {
      const p = await project(args[0])
      await deleteProject(ctx, p)
      console.log(`Deleted ${p.name}`)
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
