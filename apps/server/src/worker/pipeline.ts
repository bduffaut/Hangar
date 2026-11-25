import {
  CONTAINER_STOP_GRACE_SECONDS,
  DEFAULT_APP_PORT,
  type DeploymentStatus,
  type FailureCode,
  HEALTH_CHECK_INTERVAL_MS,
  HEALTH_CHECK_TIMEOUT_MS,
  appHostname,
} from '@hangar/shared'
import { realpath, rm } from 'node:fs/promises'
import { connect } from 'node:net'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Ctx } from '../context.ts'
import { projectLockKey, withAdvisoryLock } from '../db/lock.ts'
import {
  type Deployment,
  getDeployment,
  previousSecretsHash,
  updateDeployment,
} from '../modules/deployments/repo.ts'
import { goLive, transition } from '../modules/deployments/service.ts'
import { getEnv } from '../modules/env-vars/service.ts'
import { getProject, listCurrentDeployments, type Project } from '../modules/projects/repo.ts'
import { getSettings } from '../modules/settings/repo.ts'
import { getGithubToken } from '../modules/settings/secrets.ts'
import { listAppPorts } from '../modules/ports/repo.ts'
import { needsAdmin } from '../modules/storage/service.ts'
import { getUser } from '../modules/users/repo.ts'
import { secretsHash } from '../platform/builder.ts'
import { appImageRef, ownerBuilderName } from '../platform/names.ts'
import { appServiceName, appUpstreamUrl } from '../platform/proxy.ts'
import { ensureOwnerNetwork, startAppContainer } from './app-container.ts'
import { createDeploymentLog, type DeploymentLog } from './deployment-log.ts'
import { switchRoute } from './reconciler.ts'
import { pullStackImages } from './stack.ts'

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
  if (exposed.length === 1) return exposed[0]!
  // A published image that names several ports: guessing would health-check the wrong one.
  if (project.kind === 'image' && exposed.length > 1) {
    throw new PipelineError(
      'container_start_failed',
      `This image listens on several ports (${exposed.join(', ')}). Set the app's web port in Settings.`,
    )
  }
  return DEFAULT_APP_PORT
}

/** Published apps can take a while on their first start (setting up their database). */
const IMAGE_HEALTH_CHECK_TIMEOUT_MS = 3 * 60_000

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
  const buildSignal = AbortSignal.any([
    control,
    AbortSignal.timeout(project.buildTimeoutMinutes * 60_000),
  ])
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
      log.system(`Rolling back to the image of ${deployment.commitSha.slice(0, 7)}`)
    } else if (project.kind === 'image') {
      await advance('building', { startedAt: new Date() })
    } else {
      // The tag is recorded before building so cleanup never removes the image mid-deploy.
      const imageTag = appImageRef(project.name, deployment.number, deployment.commitSha)
      await advance('building', { startedAt: new Date(), imageTag })
    }
    // Libraries, the graphics chip, and published images are granted by admins, and checked
    // again on every deploy: an app keeps none of them once its owner is no longer an admin.
    if (await needsAdmin(ctx, project)) {
      const owner = await getUser(ctx.db, project.ownerId)
      if (owner?.role !== 'admin') {
        throw new PipelineError(
          'not_permitted',
          'This app uses a library, the graphics chip, or a published image, which only an admin can grant',
        )
      }
    }
    const env = await getEnv(ctx, project.id)
    if (deployment.status === 'building' && project.kind === 'image') {
      deployment = { ...deployment, ...(await pull(ctx, project, deployment, buildSignal, log)) }
      await advance('deploying')
    } else if (deployment.status === 'building') {
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

      // Recreate: stop the running version first, so it and the new one never share storage.
      // It is only stopped, so it can be started again if the new version does not come up.
      const paused: string[] = []
      if (project.strategy === 'recreate') {
        for (const old of await ctx.docker.listManagedApps(project.id)) {
          if (!old.running) continue
          log.system('Stopping the running version first, so the two never share storage')
          await ctx.docker.stopContainer(old.id, CONTAINER_STOP_GRACE_SECONDS)
          paused.push(old.id)
        }
      }
      try {
        log.system(`Starting the app (port ${port}, memory limit ${project.memoryLimitMb} MB)`)
        const container = await step('container_start_failed', control, () =>
          startAppContainer(ctx, project, deployment, image, port, env, (line) => log.system(line)),
        )
        containerName = container.name
        await updateDeployment(ctx.db, deployment.id, { containerId: container.id, port })

        const timeout =
          project.kind === 'image' ? IMAGE_HEALTH_CHECK_TIMEOUT_MS : HEALTH_CHECK_TIMEOUT_MS
        await waitUntilHealthy(
          ctx,
          log,
          container.name,
          image,
          port,
          timeout,
          await checkKind(ctx, project, port),
        )
        live = await switchTraffic(ctx, project, deployment, container, port, log)
      } finally {
        if (!live && paused.length) {
          // The new version must be gone before the old one writes to the storage again.
          if (containerName) await ctx.docker.removeContainer(containerName).catch(() => {})
          containerName = null
          for (const id of paused) await ctx.docker.startContainer(id).catch(() => {})
          log.system('Started the previous version again')
        }
      }
    })
    if (!live) throw new Preempted()
    await ctx.queue.send('gc', {})
    await ctx.queue.send('addresses', { projectId: project.id })
  } catch (error) {
    if (error instanceof Preempted) return
    await fail(
      ctx,
      deployment,
      control,
      buildSignal,
      project.buildTimeoutMinutes * 60_000,
      error,
      log,
    )
  } finally {
    if (containerName && !live) {
      await ctx.docker.removeContainer(containerName).catch((error: unknown) => {
        ctx.log.warn({ err: error, container: containerName }, 'Could not remove failed container')
      })
    }
    await rm(workDir, { recursive: true, force: true })
  }
}

/**
 * Pulls an image app's image and names it after the deployment (`hangar/<app>:<n>-<digest>`), so
 * rollbacks and cleanup treat it like any build. The digest stands in for a commit.
 */
async function pull(
  ctx: Ctx,
  project: Project,
  deployment: Deployment,
  signal: AbortSignal,
  log: DeploymentLog,
): Promise<Pick<Deployment, 'imageTag' | 'commitSha' | 'commitMessage'>> {
  const ref = project.image!
  log.system(`Pulling ${ref}`)
  const id = await step('pull_failed', signal, () =>
    ctx.docker.pullImage(ref, (line) => log.write('stdout', line), signal),
  )
  const digest = id.replace(/^sha256:/, '')
  const patch = {
    imageTag: appImageRef(project.name, deployment.number, digest),
    commitSha: digest,
    commitMessage: ref,
  }
  // Recorded before the name is added, so cleanup never removes it mid-deploy.
  await updateDeployment(ctx.db, deployment.id, patch)
  await step('pull_failed', signal, () => ctx.docker.tagImage(id, patch.imageTag))
  log.system(`Pulled ${ref} (${digest.slice(0, 12)})`)
  // A stack's other parts (D44), under the same time limit as the app's own image.
  await step('pull_failed', signal, () =>
    pullStackImages(ctx, project, (line) => log.write('stdout', line), signal),
  )
  return patch
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
      token: await getGithubToken(ctx, project.ownerId),
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
  // Env vars reach builds as secrets, which do not invalidate cached build steps. When they changed
  // since the project's last build (or are new), build from scratch so no step uses stale values.
  const hash = secretsHash(env)
  // The build cache does not know secret values, so layers from a build with other values could be
  // reused. Compare with the last attempt (which filled the cache, even if it failed) and the last
  // success (what is live); a first build has nothing to compare with.
  const previousHashes = await Promise.all([
    previousSecretsHash(ctx.db, project.id, deployment.number),
    previousSecretsHash(ctx.db, project.id, deployment.number, { readyOnly: true }),
  ])
  const noCache = previousHashes.some((previous) => previous !== null && previous !== hash)
  await updateDeployment(ctx.db, deployment.id, { secretsHash: hash })
  if (noCache) log.system('Env vars changed since the last build; building without the cache')
  const builderName = ownerBuilderName(project.ownerId)
  await step('build_failed', signal, async () => {
    await ctx.builder.ensureBuilder(builderName, await ensureOwnerNetwork(ctx, project.ownerId))
    await ctx.builder.build({
      builderName,
      contextDir,
      repoDir: sourceDir,
      workDir,
      tag,
      secrets: env,
      noCache,
      cacheKey: project.id,
      signal,
      onLine: log.write,
      onMethod: (m) =>
        log.system(
          m === 'dockerfile'
            ? 'Found a Dockerfile; building with it'
            : 'No Dockerfile found; detecting the framework with Railpack',
        ),
    })
  })
  log.system(`Built ${tag}`)
}

/** How long one run of an image's own health check may take. */
const OWN_CHECK_TIMEOUT_MS = 10_000
/** Pause between runs of an image's own health check while it still fails. */
const OWN_CHECK_INTERVAL_MS = 2_000

/**
 * How a new version proves it started (D51): a web app answers HTTP on its port; an app that is
 * not a web page accepts a TCP connection on its port, or, with only UDP ports, keeps running.
 */
type CheckKind = 'http' | 'tcp' | 'running'

async function checkKind(ctx: Ctx, project: Project, port: number): Promise<CheckKind> {
  if (project.web) return 'http'
  const ports = await listAppPorts(ctx.db, [project.id])
  return ports.some((p) => p.protocol === 'tcp' && p.port === port) || !ports.length
    ? 'tcp'
    : 'running'
}

/** Whether something accepts a TCP connection there, within 2 s. */
function acceptsTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 2_000 })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/** How long an app checked only by running must keep running. */
const STEADY_MS = 10_000

/**
 * Any HTTP response counts as answering. An image with its own `HEALTHCHECK` must then also pass
 * it (D46): Hangar runs that command itself, at once and every 2 s, instead of waiting on Docker's
 * interval (often 30 s). A container that exits or restarts fails at once.
 */
async function waitUntilHealthy(
  ctx: Ctx,
  log: DeploymentLog,
  containerName: string,
  image: string,
  port: number,
  timeoutMs: number,
  kind: CheckKind = 'http',
): Promise<void> {
  const url = `http://${containerName}:${port}/`
  const started = Date.now()
  log.system(
    kind === 'running'
      ? `Waiting for the app to keep running for ${STEADY_MS / 1000} s`
      : `Waiting for the app to answer on port ${port} (up to ${timeoutMs / 1000} s)`,
  )

  while (Date.now() - started < timeoutMs) {
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
    if (kind === 'running') {
      if (Date.now() - started >= STEADY_MS) {
        log.system(`The app kept running for ${STEADY_MS / 1000} s`)
        return waitForOwnCheck(ctx, log, containerName, image, started + timeoutMs)
      }
      await sleep(HEALTH_CHECK_INTERVAL_MS)
      continue
    }
    if (kind === 'tcp') {
      if (await acceptsTcp(containerName, port)) {
        const seconds = Math.round((Date.now() - started) / 100) / 10
        log.system(`The app accepted a connection on port ${port} after ${seconds} s`)
        return waitForOwnCheck(ctx, log, containerName, image, started + timeoutMs)
      }
      await sleep(HEALTH_CHECK_INTERVAL_MS)
      continue
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
      return waitForOwnCheck(ctx, log, containerName, image, started + timeoutMs)
    }
    await sleep(HEALTH_CHECK_INTERVAL_MS)
  }
  throw new PipelineError(
    'health_check_failed',
    `The app did not answer on port ${port} within ${timeoutMs / 1000} seconds. ` +
      (kind === 'tcp'
        ? `Make sure it listens on 0.0.0.0 and on port ${port}.`
        : `Make sure it listens on 0.0.0.0 and on the port in the PORT variable.`),
  )
}

/** Runs the image's own health check until it passes, if it has one (D46). */
async function waitForOwnCheck(
  ctx: Ctx,
  log: DeploymentLog,
  containerName: string,
  image: string,
  deadline: number,
): Promise<void> {
  const cmd = await ctx.docker.imageHealthCheck(image).catch(() => null)
  if (!cmd) return
  log.system(`Running the image's own health check: ${cmd.join(' ')}`)
  const started = Date.now()
  let last = ''
  while (Date.now() < deadline) {
    const state = await ctx.docker.containerState(containerName)
    if (!state?.running || state.restarting || state.restartCount > 0) {
      throw new PipelineError('health_check_failed', 'The app stopped during its own health check')
    }
    const result = await ctx.docker
      .execOnce(containerName, cmd, OWN_CHECK_TIMEOUT_MS)
      .catch((error: unknown) => ({ exitCode: -1, output: String(error) }))
    if (result.exitCode === 0) {
      const seconds = Math.round((Date.now() - started) / 100) / 10
      log.system(`The image's own health check passed after ${seconds} s`)
      return
    }
    // 126 and 127: the command cannot run in this container (a tool the image does not have).
    // Docker would mark it unhealthy forever; it says nothing about the app, so Hangar moves on.
    if (result.exitCode === 126 || result.exitCode === 127) {
      log.system(`The image's own health check cannot run here (${result.output}); skipping it`)
      return
    }
    last = result.output
    await sleep(OWN_CHECK_INTERVAL_MS)
  }
  if (last) log.write('stdout', last)
  throw new PipelineError(
    'health_check_failed',
    "The app answers, but its image's own health check did not pass in time" +
      (last ? `. Its last output: ${last.split('\n').at(-1)}` : ''),
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
  const { lanDomain } = await getSettings(ctx.db)
  const url = project.web && lanDomain ? ` at http://${appHostname(project.name, lanDomain)}` : ''
  const confirm = async () => {
    log.system(`Deployment #${deployment.number} is live${url}; stopping the previous version`)
    await log.flush()
    const outcome = await goLive(ctx, deployment)
    if (outcome === 'outdated') {
      throw new PipelineError('superseded', 'A newer deployment of this project went live first')
    }
    return outcome === 'live'
  }

  // An app that is not a web page has no route to switch (D51): its ports belong to the container.
  const live = !project.web
    ? await confirm()
    : await switchRoute(
        ctx,
        project.name,
        { deploymentNumber: deployment.number, port },
        async () => {
          log.system('Switching traffic to the new version')
          const upstream = appUpstreamUrl({ host: container.name, port })
          await ctx.proxy
            .waitForService(appServiceName(project.name), upstream)
            .catch((error: Error) => {
              throw new PipelineError('internal', error.message)
            })
          return confirm()
        },
      )
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
  timeoutMs: number,
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
    const minutes = Math.round(timeoutMs / 60_000)
    reason = `The build took longer than ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, this app's build time limit, and was stopped`
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
