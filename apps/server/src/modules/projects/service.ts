import { randomBytes } from 'node:crypto'
import {
  appHostname,
  checkProjectName,
  CONTAINER_STOP_GRACE_SECONDS,
  githubRepoSlug,
  hooksHostname,
  isValidBranchName,
  isValidRepoUrl,
  normalizeRootDir,
  type ProjectView,
  type TriggerMode,
} from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { projectLockKey, withAdvisoryLock } from '../../db/lock.ts'
import { notFound, UserError } from '../../errors.ts'
import { appImageRepository } from '../../platform/names.ts'
import { reconcileOne, syncRouting } from '../../worker/reconciler.ts'
import {
  listDeploymentsById,
  listLatestDeployments,
  listRecentStatuses,
} from '../deployments/repo.ts'
import { cancelActive } from '../deployments/service.ts'
import { deploymentView } from '../deployments/views.ts'
import { getSettings } from '../settings/repo.ts'
import { getGithubToken } from '../settings/secrets.ts'
import {
  deleteProject as deleteProjectRow,
  getProject,
  insertProject,
  listProjects,
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
  return clean
}

/** In development, tests and the CLI deploy from local file:// repositories. */
function isAllowedRepoUrl(ctx: Ctx, repoUrl: string): boolean {
  return isValidRepoUrl(repoUrl) || (!ctx.config.isProduction && repoUrl.startsWith('file:///'))
}

export const findProject = (ctx: Ctx, id: string) => getProject(ctx.db, id)

export async function getProjectOrThrow(ctx: Ctx, id: string): Promise<Project> {
  const project = await getProject(ctx.db, id)
  if (!project) throw notFound('Project')
  return project
}

export async function createProject(
  ctx: Ctx,
  input: ProjectSettings & { name: string; repoUrl: string },
): Promise<{ project: Project; headSha: string }> {
  const problem = checkProjectName(input.name)
  if (problem) throw new ProjectError(NAME_PROBLEMS[problem])
  const repoUrl = input.repoUrl.trim()
  if (!isAllowedRepoUrl(ctx, repoUrl)) {
    throw new ProjectError(
      "Enter the repository's HTTPS address, like https://github.com/you/app.",
      'Hangar clones over HTTPS. For a private repository, connect a GitHub token in Settings.',
    )
  }
  const settings = cleanSettings(input)
  const token = await getGithubToken(ctx)
  const branch =
    settings.branch ??
    (await ctx.git.defaultBranch(repoUrl, token).catch(() => {
      throw new ProjectError(
        'Hangar could not reach that repository.',
        'Check the address. If the repository is private, connect a GitHub token in Settings first.',
      )
    }))
  if (!branch) throw new ProjectError('That repository has no default branch. Enter a branch name.')
  // Checked before anything is saved, so a mistyped branch does not leave a half-created project.
  const headSha = await ctx.git.headOf(repoUrl, branch, token).catch(() => null)
  if (!headSha) {
    throw new ProjectError(`The branch "${branch}" was not found in that repository.`)
  }

  const { publicDomain } = await getSettings(ctx.db)
  let project: Project
  try {
    project = await insertProject(ctx.db, {
      ...settings,
      name: input.name,
      repoUrl,
      branch,
      triggerMode: settings.triggerMode ?? (publicDomain ? 'webhook' : 'poll'),
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
  project: Project,
  settings: ProjectSettings,
): Promise<Project> {
  await updateProject(ctx.db, project.id, cleanSettings(settings))
  return (await getProject(ctx.db, project.id))!
}

/** Removes the project's containers, images, and records, cancelling any build in progress. */
export async function deleteProject(ctx: Ctx, project: Project): Promise<void> {
  // A running build would otherwise finish and leave an image behind (cleanup removes images of
  // deleted projects later, but cancelling stops the work now).
  await cancelActive(ctx, project).catch(() => {})
  await withAdvisoryLock(ctx.db, projectLockKey(project.id), async () => {
    for (const container of await ctx.docker.listManagedApps(project.id)) {
      await ctx.docker.removeContainer(container.id, CONTAINER_STOP_GRACE_SECONDS)
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

export function webhookUrl(publicDomain: string | null, projectId: string): string | null {
  return publicDomain
    ? `https://${hooksHostname(publicDomain)}/api/webhooks/github/${projectId}`
    : null
}

export async function webhookInfo(ctx: Ctx, project: Project) {
  const { publicDomain } = await getSettings(ctx.db)
  return {
    url: webhookUrl(publicDomain, project.id),
    secret: webhookSecret(ctx, project),
    contentType: 'application/json' as const,
    active: project.triggerMode === 'webhook',
  }
}

/** Best effort: if the token may administer the repository's hooks, set the webhook up for the user. */
async function tryCreateGithubWebhook(ctx: Ctx, project: Project, secret: string) {
  const { publicDomain } = await getSettings(ctx.db)
  const slug = githubRepoSlug(project.repoUrl)
  const token = await getGithubToken(ctx)
  const url = webhookUrl(publicDomain, project.id)
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
  const [latest, current, recent] = await Promise.all([
    listLatestDeployments(ctx.db, ids),
    listDeploymentsById(ctx.db, currentIds),
    listRecentStatuses(ctx.db, ids, RUNWAY_LIGHTS),
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
      publicUrl: settings.publicDomain
        ? `https://${appHostname(p.name, settings.publicDomain)}`
        : null,
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

export async function allProjectViews(ctx: Ctx): Promise<ProjectView[]> {
  return projectViews(ctx, await listProjects(ctx.db))
}
