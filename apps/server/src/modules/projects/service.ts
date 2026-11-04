import { randomBytes } from 'node:crypto'
import {
  appHostname,
  checkMemberHostname,
  checkProjectName,
  checkPublicHostname,
  CONTAINER_STOP_GRACE_SECONDS,
  defaultDomain,
  githubRepoSlug,
  hooksHostname,
  isValidBranchName,
  isPublicRepoHost,
  isValidRepoUrl,
  MAX_PROJECTS_PER_MEMBER,
  normalizeRootDir,
  type PublicHostnameProblem,
  type ProjectView,
  type TriggerMode,
  type UserRole,
} from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { projectLockKey, withAdvisoryLock } from '../../db/lock.ts'
import { notFound, UserError } from '../../errors.ts'
import { appImageRepository } from '../../platform/names.ts'
import { addressViews, listAddressChecks, pruneAddressChecks } from '../addresses/service.ts'
import { reconcileOne, syncRouting } from '../../worker/reconciler.ts'
import {
  listDeploymentsById,
  listLatestDeployments,
  listRecentStatuses,
} from '../deployments/repo.ts'
import { cancelAllActive } from '../deployments/service.ts'
import { deploymentView } from '../deployments/views.ts'
import { getSettings } from '../settings/repo.ts'
import { getGithubToken } from '../settings/secrets.ts'
import {
  deleteProject as deleteProjectRow,
  getProject,
  insertProject,
  listProjects,
  listProjectsOf,
  type Project,
  updateProject,
} from './repo.ts'

export class ProjectError extends UserError {
  constructor(message: string, hint?: string) {
    super(400, 'invalid_project', message, hint)
  }
}

const NAME_PROBLEMS = {
  empty: 'Enter a project name.',
  too_long: 'Project names can be at most 40 characters.',
  invalid_characters:
    'Project names can use lowercase letters, digits, and dashes, and cannot start or end with a dash.',
  reserved: 'That name is reserved by Hangar. Pick another one.',
}

export interface ProjectSettings {
  branch?: string
  rootDir?: string
  /** null means auto-detect. */
  port?: number | null
  memoryLimitMb?: number
  triggerMode?: TriggerMode
  hostnames?: string[]
}

/** Validates and normalizes settings shared by create and update. */
function cleanSettings(settings: ProjectSettings): ProjectSettings {
  const clean = { ...settings }
  if (clean.rootDir !== undefined) {
    const rootDir = normalizeRootDir(clean.rootDir)
    if (rootDir === null) {
      throw new ProjectError(
        'The root directory must be a folder inside the repository, like "apps/web".',
      )
    }
    clean.rootDir = rootDir
  }
  if (clean.branch !== undefined && !isValidBranchName(clean.branch)) {
    throw new ProjectError(`"${clean.branch}" is not a valid branch name.`)
  }
  if (
    clean.port != null &&
    (!Number.isInteger(clean.port) || clean.port < 1 || clean.port > 65535)
  ) {
    throw new ProjectError('The port must be a number from 1 to 65535.')
  }
  if (
    clean.memoryLimitMb !== undefined &&
    (!Number.isInteger(clean.memoryLimitMb) || clean.memoryLimitMb < 64)
  ) {
    throw new ProjectError('The memory limit must be at least 64 MB.')
  }
  if (clean.hostnames !== undefined) {
    clean.hostnames = [
      ...new Set(
        clean.hostnames.map((h) =>
          h
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, '')
            .replace(/\.$/, ''),
        ),
      ),
    ].filter(Boolean)
  }
  return clean
}

const HOSTNAME_PROBLEMS: Record<PublicHostnameProblem, (h: string, domains: string[]) => string> = {
  invalid: (h) => `"${h}" is not an address. Enter one like blog.example.com, without https://.`,
  not_your_domain: (h, domains) =>
    domains.length
      ? `${h} is not under one of your domains (${domains.join(', ')}). Add its domain in Settings first.`
      : `${h} cannot be used yet: add your domain under Public access in Settings first.`,
  too_deep: (h) =>
    `${h} is more than one level under your domain. Cloudflare's free certificate covers one level, like blog.example.com.`,
  reserved: (h) => `${h} is reserved for Hangar itself. Pick another name.`,
  admin_only: (h) => `Only an admin can use ${h}. Pick another name under the domain.`,
}

/** The account a project is created for. */
export interface ProjectOwner {
  id: string
  role: UserRole
}

/** Each address must sit on one of the server's domains and belong to one project only. */
async function checkHostnames(
  ctx: Ctx,
  role: UserRole,
  projectId: string | null,
  hostnames: string[],
) {
  if (hostnames.length === 0) return
  const { publicDomains } = await getSettings(ctx.db)
  for (const hostname of hostnames) {
    const problem =
      checkPublicHostname(hostname, publicDomains) ??
      (role === 'admin' ? null : checkMemberHostname(hostname, publicDomains))
    if (problem) throw new ProjectError(HOSTNAME_PROBLEMS[problem](hostname, publicDomains))
  }
  const owner = (await listProjects(ctx.db)).find(
    (p) => p.id !== projectId && p.hostnames.some((h) => hostnames.includes(h)),
  )
  if (owner) {
    // Says nothing about the other project: it may belong to someone else.
    const taken = owner.hostnames.find((h) => hostnames.includes(h))
    throw new UserError(409, 'address_taken', `${taken} is already in use by another project.`)
  }
}

/** In development, tests and the CLI deploy from local file:// repositories. */
function isAllowedRepoUrl(ctx: Ctx, repoUrl: string, role: UserRole): boolean {
  if (!ctx.config.isProduction && repoUrl.startsWith('file:///')) return true
  return isValidRepoUrl(repoUrl) && (role === 'admin' || isPublicRepoHost(repoUrl))
}

export const findProject = (ctx: Ctx, id: string) => getProject(ctx.db, id)

/**
 * The project, if `userId` owns it. Everyone else gets the same answer as for a project that does
 * not exist, so ids cannot be probed. Every request about a project goes through here.
 */
export async function ownedProject(ctx: Ctx, userId: string, id: string): Promise<Project> {
  const project = await getProject(ctx.db, id)
  if (!project || project.ownerId !== userId) throw notFound('Project')
  return project
}

export async function createProject(
  ctx: Ctx,
  owner: ProjectOwner,
  input: ProjectSettings & { name: string; repoUrl: string },
): Promise<{ project: Project; headSha: string }> {
  const problem = checkProjectName(input.name)
  if (problem) throw new ProjectError(NAME_PROBLEMS[problem])
  const repoUrl = input.repoUrl.trim()
  if (
    owner.role !== 'admin' &&
    (await listProjectsOf(ctx.db, owner.id)).length >= MAX_PROJECTS_PER_MEMBER
  ) {
    throw new ProjectError(`An account can have at most ${MAX_PROJECTS_PER_MEMBER} projects.`)
  }
  if (!isAllowedRepoUrl(ctx, repoUrl, owner.role)) {
    throw new ProjectError(
      "Enter the repository's HTTPS address, like https://github.com/you/app.",
      'Hangar clones over HTTPS. For a private repository, connect your GitHub token under Account.',
    )
  }
  const settings = cleanSettings(input)
  const current = await getSettings(ctx.db)
  const domain = defaultDomain(current)
  // By default an app goes public as <name>.<default domain>, as soon as there is a domain.
  settings.hostnames ??= domain ? [appHostname(input.name, domain)] : []
  await checkHostnames(ctx, owner.role, null, settings.hostnames)
  const token = await getGithubToken(ctx, owner.id)
  const branch =
    settings.branch ??
    (await ctx.git.defaultBranch(repoUrl, token).catch(() => {
      throw new ProjectError(
        'Hangar could not reach that repository.',
        'Check the address. If the repository is private, connect your GitHub token under Account first.',
      )
    }))
  if (!branch) throw new ProjectError('That repository has no default branch. Enter a branch name.')
  // Checked before anything is saved, so a mistyped branch does not leave a half-created project.
  const headSha = await ctx.git.headOf(repoUrl, branch, token).catch(() => null)
  if (!headSha) {
    throw new ProjectError(`The branch "${branch}" was not found in that repository.`)
  }

  let project: Project
  try {
    project = await insertProject(ctx.db, {
      ...settings,
      ownerId: owner.id,
      name: input.name,
      repoUrl,
      branch,
      triggerMode: settings.triggerMode ?? (domain ? 'webhook' : 'poll'),
    })
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === '23505') {
      throw new UserError(409, 'name_taken', `A project named "${input.name}" already exists.`)
    }
    throw error
  }
  const secret = randomBytes(32).toString('hex')
  await updateProject(ctx.db, project.id, {
    webhookSecret: ctx.crypto.seal(secret, webhookAad(project.id)),
  })
  if (project.triggerMode === 'webhook') await tryCreateGithubWebhook(ctx, project, secret)
  return { project: (await getProject(ctx.db, project.id))!, headSha }
}

/** Changes take effect on the next deploy. */
export async function updateProjectSettings(
  ctx: Ctx,
  role: UserRole,
  project: Project,
  settings: ProjectSettings,
): Promise<Project> {
  const clean = cleanSettings(settings)
  if (clean.hostnames) await checkHostnames(ctx, role, project.id, clean.hostnames)
  await updateProject(ctx.db, project.id, clean)
  // Addresses are routes, so they apply right away rather than on the next deploy.
  if (clean.hostnames) {
    await syncRouting(ctx)
    await pruneAddressChecks(ctx, project.id, clean.hostnames)
    await ctx.queue.send('addresses', { projectId: project.id })
  }
  return (await getProject(ctx.db, project.id))!
}

/** Removes the project's containers, images, and records, cancelling any build in progress. */
export async function deleteProject(ctx: Ctx, project: Project): Promise<void> {
  // A running build would otherwise finish and leave an image behind (cleanup removes images of
  // deleted projects later, but cancelling stops the work now).
  await cancelAllActive(ctx, project)
  await withAdvisoryLock(ctx.db, projectLockKey(project.id), async () => {
    // The project is going away, so its containers are removed at once rather than stopped
    // gracefully (which can take ten seconds each for an app that ignores SIGTERM).
    for (const container of await ctx.docker.listManagedApps(project.id)) {
      await ctx.docker.removeContainer(container.id)
    }
    await deleteProjectRow(ctx.db, project.id)
  })
  await syncRouting(ctx)
  for (const tag of await ctx.docker.listTags(appImageRepository(project.name))) {
    await ctx.docker.removeImage(tag).catch((error: unknown) => {
      ctx.log.warn({ err: error, image: tag }, 'Could not remove image of deleted project')
    })
  }
  await ctx.queue.send('gc', {})
}

export async function setDesiredState(ctx: Ctx, project: Project, state: 'running' | 'stopped') {
  if (!project.currentDeploymentId && state === 'running') {
    throw new UserError(409, 'not_deployed', 'This project has not been deployed yet.')
  }
  await updateProject(ctx.db, project.id, { desiredState: state })
  await reconcileOne(ctx, project.id)
  await ctx.queue.send('addresses', { projectId: project.id })
}

export async function restartProject(ctx: Ctx, project: Project): Promise<void> {
  await withAdvisoryLock(ctx.db, projectLockKey(project.id), async () => {
    const [running] = (await ctx.docker.listManagedApps(project.id)).filter(
      (c) => c.deploymentId === project.currentDeploymentId,
    )
    if (!running || project.desiredState !== 'running') {
      throw new UserError(409, 'not_running', 'This project is not running. Start it instead.')
    }
    await ctx.docker.restartContainer(running.id, CONTAINER_STOP_GRACE_SECONDS)
  })
}

// Webhooks

const webhookAad = (projectId: string) => `webhook:${projectId}`

export function webhookSecret(ctx: Ctx, project: Project): string {
  if (!project.webhookSecret) throw new Error(`Project ${project.id} has no webhook secret`)
  return ctx.crypto.open(project.webhookSecret, webhookAad(project.id))
}

export function webhookUrl(domain: string | null, projectId: string): string | null {
  return domain ? `https://${hooksHostname(domain)}/api/webhooks/github/${projectId}` : null
}

export async function webhookInfo(ctx: Ctx, project: Project) {
  const domain = defaultDomain(await getSettings(ctx.db))
  return {
    url: webhookUrl(domain, project.id),
    secret: webhookSecret(ctx, project),
    contentType: 'application/json' as const,
    active: project.triggerMode === 'webhook',
  }
}

/** Best effort: if the token may administer the repository's hooks, set the webhook up for the user. */
async function tryCreateGithubWebhook(ctx: Ctx, project: Project, secret: string) {
  const domain = defaultDomain(await getSettings(ctx.db))
  const slug = githubRepoSlug(project.repoUrl)
  const token = await getGithubToken(ctx, project.ownerId)
  const url = webhookUrl(domain, project.id)
  if (!slug || !token || !url) return
  await ctx.github.createPushWebhook(token, slug, url, secret).catch((error: unknown) => {
    ctx.log.info(
      { err: error, project: project.name },
      'Could not create the GitHub webhook automatically',
    )
  })
}

// Views

/** How many recent deployments a project card shows. */
const RUNWAY_LIGHTS = 12

export async function projectViews(ctx: Ctx, projects: Project[]): Promise<ProjectView[]> {
  const settings = await getSettings(ctx.db)
  const ids = projects.map((p) => p.id)
  const currentIds = projects.flatMap((p) => (p.currentDeploymentId ? [p.currentDeploymentId] : []))
  const [latest, current, recent, checks] = await Promise.all([
    listLatestDeployments(ctx.db, ids),
    listDeploymentsById(ctx.db, currentIds),
    listRecentStatuses(ctx.db, ids, RUNWAY_LIGHTS),
    listAddressChecks(ctx, ids),
  ])
  return projects.map((p) => {
    const latestRow = latest.find((d) => d.projectId === p.id)
    const currentRow = current.find((d) => d.id === p.currentDeploymentId)
    return {
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl,
      branch: p.branch,
      rootDir: p.rootDir,
      port: p.port,
      memoryLimitMb: p.memoryLimitMb,
      triggerMode: p.triggerMode,
      desiredState: p.desiredState,
      url: settings.lanDomain ? `http://${appHostname(p.name, settings.lanDomain)}` : null,
      hostnames: p.hostnames,
      publicUrls: p.hostnames.map((h) => `https://${h}`),
      addresses: addressViews(p.hostnames, checks),
      current: currentRow ? deploymentView(currentRow, p.currentDeploymentId) : null,
      latest: latestRow ? deploymentView(latestRow, p.currentDeploymentId) : null,
      recent: recent
        .filter((d) => d.projectId === p.id)
        .map(({ id, number, status }) => ({ id, number, status })),
      createdAt: p.createdAt.toISOString(),
    }
  })
}

export async function projectView(ctx: Ctx, project: Project): Promise<ProjectView> {
  return (await projectViews(ctx, [project]))[0]!
}

export async function projectViewsOf(ctx: Ctx, ownerId: string): Promise<ProjectView[]> {
  return projectViews(ctx, await listProjectsOf(ctx.db, ownerId))
}

const RUNTIME_LOG_TAIL = 500

/** The live output of the project's current container (its last lines first), or null if none runs. */
export async function followRuntimeLogs(ctx: Ctx, project: Project, signal: AbortSignal) {
  const [container] = (await ctx.docker.listManagedApps(project.id)).filter(
    (c) => c.deploymentId === project.currentDeploymentId,
  )
  return container ? ctx.docker.followLogs(container.id, RUNTIME_LOG_TAIL, signal) : null
}
