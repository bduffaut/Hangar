import {
  BUILD_TIMEOUT_MS,
  CONTAINER_STOP_GRACE_SECONDS,
  DEFAULT_APP_PORT,
  type DeploymentStatus,
  type FailureCode,
  HEALTH_CHECK_INTERVAL_MS,
  HEALTH_CHECK_TIMEOUT_MS,
  appHostname,
} from '@hangar/shared'
import { realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Ctx } from '../context.ts'
import { projectLockKey, withAdvisoryLock } from '../db/lock.ts'
import { type Deployment, getDeployment, updateDeployment } from '../modules/deployments/repo.ts'
import { goLive, transition } from '../modules/deployments/service.ts'
import { getEnv } from '../modules/env-vars/service.ts'
import { getProject, listCurrentDeployments, type Project } from '../modules/projects/repo.ts'
import { getSettings } from '../modules/settings/repo.ts'
import { getGithubToken } from '../modules/settings/secrets.ts'
import { appImageRef } from '../platform/names.ts'
import { appServiceName, appUpstreamUrl } from '../platform/proxy.ts'
import { startAppContainer } from './app-container.ts'
import { createDeploymentLog, type DeploymentLog } from './deployment-log.ts'
import { switchRoute } from './reconciler.ts'

/** Abort reasons for the controller the worker passes in. */
export const ABORT_CANCEL = 'cancel'
export const ABORT_SHUTDOWN = 'shutdown'

export class PipelineError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message)
  }
}

/** Another actor moved the deployment (e.g. cancelled while queued); stop quietly. */
class Preempted extends Error {}

/** Runs `fn`, turning any error other than an abort into a PipelineError with `code`. */
async function step<T>(code: FailureCode, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (signal.aborted || error instanceof PipelineError) throw error
    throw new PipelineError(code, error instanceof Error ? error.message : String(error))
  }
}

/**
 * The build context: the project's root directory inside the clone. Symlinks are resolved first,
 * so a repository cannot point the build at files outside its own checkout.
 */
async function resolveContextDir(sourceDir: string, rootDir: string): Promise<string> {
  const root = await realpath(sourceDir)
  const contextDir = await realpath(path.resolve(sourceDir, rootDir)).catch(() => {
    throw new PipelineError(
      'build_failed',
      `Root directory "${rootDir}" does not exist in this commit`,
    )
  })
  if (contextDir !== root && !contextDir.startsWith(root + path.sep)) {
    throw new PipelineError('build_failed', `Root directory "${rootDir}" is outside the repository`)
  }
  return contextDir
}

async function resolvePort(ctx: Ctx, project: Project, image: string): Promise<number> {
  if (project.port) return project.port
  const exposed = await ctx.docker.exposedPorts(image)
  return exposed.length === 1 ? exposed[0]! : DEFAULT_APP_PORT
}

/**
 * Clone → build → run → health check → switch. Builds have `deployment.trigger !== 'rollback'`;
 * rollbacks reuse an existing image and start at "run". On any failure the new container is
 * removed and the previous one keeps serving.
 */
export async function runDeployment(
  ctx: Ctx,
  deploymentId: string,
  control: AbortSignal,
): Promise<void> {
  const queued = await getDeployment(ctx.db, deploymentId)
  if (!queued || queued.status !== 'queued') return
  const project = await getProject(ctx.db, queued.projectId)
  if (!project) return

  const log = createDeploymentLog(ctx, deploymentId)
  const workDir = path.join(ctx.config.buildDir, deploymentId)
  const buildSignal = AbortSignal.any([control, AbortSignal.timeout(BUILD_TIMEOUT_MS)])
  let deployment: Deployment = queued
  let containerName: string | null = null
  let live = false

  const advance = async (to: DeploymentStatus, patch: Partial<Deployment> = {}) => {
    const row = await transition(ctx, deployment.id, deployment.status, to, patch)
    if (!row) throw new Preempted()
    deployment = row
  }

  try {
    // Leave `queued` before anything that can fail, so a failure is always recorded on the row.
    if (deployment.trigger === 'rollback') {
      await advance('deploying', { startedAt: new Date() })
      log.system(`Rolling back to the image of commit ${deployment.commitSha.slice(0, 7)}`)
    } else {
      // The tag is recorded before building so cleanup never removes the image mid-deploy.
      const imageTag = appImageRef(project.name, deployment.number, deployment.commitSha)
      await advance('building', { startedAt: new Date(), imageTag })
    }
    const env = await getEnv(ctx, project.id)
    if (deployment.status === 'building') {
      await build(ctx, project, deployment, env, workDir, buildSignal, log)
      await advance('deploying')
    }

    // One deployment per project at a time from here on: starting, switching, and removing
    // containers must not interleave with another deployment or the reconciler.
    await withAdvisoryLock(ctx.db, projectLockKey(project.id), async () => {
      const [current] = await listCurrentDeployments(ctx.db, project.id)
      if (current && current.deployment.number > deployment.number) {
        // e.g. a rollback requested after this build started has already gone live.
        throw new PipelineError('superseded', 'A newer deployment of this project went live first')
      }
      const image = deployment.imageTag!
      if (!(await ctx.docker.imageExists(image))) {
        throw new PipelineError(
          'image_missing',
          `The image ${image} no longer exists on this server`,
        )
      }
      const port = await resolvePort(ctx, project, image)

      log.system(`Starting the app (port ${port}, memory limit ${project.memoryLimitMb} MB)`)
      const container = await step('container_start_failed', control, () =>
        startAppContainer(ctx, project, deployment, image, port, env),
      )
      containerName = container.name
      await updateDeployment(ctx.db, deployment.id, { containerId: container.id, port })

      await waitUntilHealthy(ctx, log, container.name, port)
      live = await switchTraffic(ctx, project, deployment, container, port, log)
    })
    if (!live) throw new Preempted()
    await ctx.queue.send('gc', {})
  } catch (error) {
    if (error instanceof Preempted) return
    await fail(ctx, deployment, control, buildSignal, error, log)
  } finally {
    if (containerName && !live) {
      await ctx.docker.removeContainer(containerName).catch((error: unknown) => {
        ctx.log.warn({ err: error, container: containerName }, 'Could not remove failed container')
      })
    }
    await rm(workDir, { recursive: true, force: true })
  }
}

/** Clones the deployment's commit and builds it into `deployment.imageTag`. */
async function build(
  ctx: Ctx,
  project: Project,
  deployment: Deployment,
  env: Record<string, string>,
  workDir: string,
  signal: AbortSignal,
  log: DeploymentLog,
): Promise<void> {
  const sourceDir = path.join(workDir, 'src')
  log.system(`Cloning ${project.repoUrl} at ${deployment.commitSha.slice(0, 7)}`)
  const commit = await step('clone_failed', signal, async () =>
    ctx.git.cloneAt({
      repoUrl: project.repoUrl,
      sha: deployment.commitSha,
      token: await getGithubToken(ctx),
      dir: sourceDir,
      signal,
      onLine: log.write,
    }),
  )
  await updateDeployment(ctx.db, deployment.id, {
    commitMessage: commit.message,
    commitAuthor: commit.author,
  })
  log.system(`Commit: ${commit.message} (${commit.author})`)

  const contextDir = await resolveContextDir(sourceDir, project.rootDir)
  const tag = deployment.imageTag!
  await step('build_failed', signal, () =>
    ctx.builder.build({
      contextDir,
      repoDir: sourceDir,
      workDir,
      tag,
      secrets: env,
      cacheKey: project.id,
      signal,
      onLine: log.write,
      onMethod: (m) =>
        log.system(
          m === 'dockerfile'
            ? 'Found a Dockerfile; building with it'
            : 'No Dockerfile found; detecting the framework with Railpack',
        ),
    }),
  )
  log.system(`Built ${tag}`)
}

/** Any HTTP response counts as healthy. A container that exits or restarts fails at once. */
async function waitUntilHealthy(
  ctx: Ctx,
  log: DeploymentLog,
  containerName: string,
  port: number,
): Promise<void> {
  const url = `http://${containerName}:${port}/`
  const started = Date.now()
  log.system(
    `Waiting for the app to answer on port ${port} (up to ${HEALTH_CHECK_TIMEOUT_MS / 1000} s)`,
  )

  while (Date.now() - started < HEALTH_CHECK_TIMEOUT_MS) {
    const state = await ctx.docker.containerState(containerName)
    if (!state || !state.running || state.restarting || state.restartCount > 0) {
      log.system('The app stopped while starting. Its last output:')
      for (const line of await ctx.docker.containerLogTail(containerName, 20)) {
        log.write('stdout', line)
      }
      throw new PipelineError(
        'health_check_failed',
        `The app exited${state ? ` with code ${state.exitCode}` : ''} before it answered on port ${port}`,
      )
    }
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2_000) })
      .then(async (res) => {
        await res.body?.cancel()
        return res
      })
      .catch(() => null)
    if (response) {
      const seconds = Math.round((Date.now() - started) / 100) / 10
      log.system(`The app answered with HTTP ${response.status} after ${seconds} s`)
      return
    }
    await sleep(HEALTH_CHECK_INTERVAL_MS)
  }
  throw new PipelineError(
    'health_check_failed',
    `The app did not answer on port ${port} within ${HEALTH_CHECK_TIMEOUT_MS / 1000} seconds. ` +
      `Make sure it listens on 0.0.0.0 and on the port in the PORT variable.`,
  )
}

/**
 * Points the proxy at the new container, waits until Traefik confirms, then makes the deployment
 * current. Only after that is the previous container stopped. Every log line is saved before the
 * deployment turns ready, so a viewer that sees the final status has the whole log.
 */
async function switchTraffic(
  ctx: Ctx,
  project: Project,
  deployment: Deployment,
  container: { name: string; id: string },
  port: number,
  log: DeploymentLog,
): Promise<boolean> {
  log.system('Switching traffic to the new version')
  const { lanDomain } = await getSettings(ctx.db)
  const url = lanDomain ? ` at http://${appHostname(project.name, lanDomain)}` : ''
  const target = { deploymentNumber: deployment.number, port }

  const live = await switchRoute(ctx, project.name, target, async () => {
    const upstream = appUpstreamUrl({ host: container.name, port })
    await ctx.proxy.waitForService(appServiceName(project.name), upstream).catch((error: Error) => {
      throw new PipelineError('internal', error.message)
    })
    log.system(`Deployment #${deployment.number} is live${url}; stopping the previous version`)
    await log.flush()
    const outcome = await goLive(ctx, deployment)
    if (outcome === 'outdated') {
      throw new PipelineError('superseded', 'A newer deployment of this project went live first')
    }
    return outcome === 'live'
  })
  if (!live) return false

  for (const old of await ctx.docker.listManagedApps(project.id)) {
    if (old.id === container.id) continue
    await ctx.docker
      .removeContainer(old.id, CONTAINER_STOP_GRACE_SECONDS)
      .catch((error: unknown) => {
        ctx.log.warn({ err: error, container: old.name }, 'Could not remove previous container')
      })
  }
  return true
}

async function fail(
  ctx: Ctx,
  deployment: Deployment,
  control: AbortSignal,
  buildSignal: AbortSignal,
  error: unknown,
  log: DeploymentLog,
): Promise<void> {
  const from = deployment.status
  const finishedAt = new Date()
  // Cancel only applies while building; once deploying, the deployment runs to the end.
  if (from === 'building' && control.aborted && control.reason === ABORT_CANCEL) {
    log.system('Cancelled')
    await log.flush()
    await transition(ctx, deployment.id, from, 'cancelled', {
      failureCode: 'cancelled_by_user',
      finishedAt,
    })
    return
  }

  let code: FailureCode = 'internal'
  let reason = error instanceof Error ? error.message : String(error)
  if (control.aborted && control.reason === ABORT_SHUTDOWN) {
    code = 'interrupted'
    reason = 'Hangar shut down while this deployment was in progress'
  } else if (from === 'building' && buildSignal.aborted) {
    code = 'build_timeout'
    reason = `The build took longer than ${BUILD_TIMEOUT_MS / 60_000} minutes and was stopped`
  } else if (error instanceof PipelineError) {
    code = error.code
  } else {
    ctx.log.error({ err: error, deploymentId: deployment.id }, 'Deployment failed unexpectedly')
  }

  log.system(`Failed: ${reason.split('\n')[0]}`)
  await log.flush()
  if (from === 'queued') return
  await transition(ctx, deployment.id, from, 'failed', {
    failureCode: code,
    failureReason: reason,
    finishedAt,
  })
}
