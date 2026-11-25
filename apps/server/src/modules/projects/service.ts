import { randomBytes } from 'node:crypto'
import {
  type PortProtocol,
  serialDeviceName,
  appHostname,
  BUILD_TIMEOUT_MAX_MINUTES,
  BUILD_TIMEOUT_MIN_MINUTES,
  checkMemberHostname,
  checkProjectName,
  checkPublicHostname,
  CONTAINER_STOP_GRACE_SECONDS,
  defaultDomain,
  githubRepoSlug,
  hooksHostname,
  isValidBranchName,
  isMemberCatalogApp,
  isValidImageRef,
  isPublicRepoHost,
  isValidRepoUrl,
  MAX_PROJECTS_PER_MEMBER,
  normalizeRootDir,
  type PublicHostnameProblem,
  type ProjectView,
  type DeployStrategy,
  type TriggerMode,
  type CatalogInstall,
  type UserRole,
} from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { projectLockKey, withAdvisoryLock } from '../../db/lock.ts'
import { notFound, UserError } from '../../errors.ts'
import { appImageRepository, serviceContainerName } from '../../platform/names.ts'
import { insertAppDevices, listAppDevices } from '../devices/repo.ts'
import { checkDevice } from '../devices/service.ts'
import { insertAppPorts, listAppPorts } from '../ports/repo.ts'
import { checkPorts, portAddress, portHost } from '../ports/service.ts'
import { addressViews, listAddressChecks, pruneAddressChecks } from '../addresses/service.ts'
import { reconcileOne, syncRouting } from '../../worker/reconciler.ts'
import { removeStack, stackServices } from '../../worker/stack.ts'
import { findTemplate } from '../catalog/templates.ts'
import {
  listDeploymentsById,
  listLatestDeployments,
  listRecentStatuses,
} from '../deployments/repo.ts'
import { cancelAllActive } from '../deployments/service.ts'
import { deploymentView } from '../deployments/views.ts'
import { getSettings } from '../settings/repo.ts'
import { getGithubToken } from '../settings/secrets.ts'
import { setEnv } from '../env-vars/service.ts'
import {
  insertServiceVolumes,
  listAppLibraries,
  listAppVolumes,
  replaceAppStorage,
} from '../storage/repo.ts'
import { cleanStorage, deleteAppVolumes, type StorageInput } from '../storage/service.ts'
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

const NOT_WEB_PROBLEM =
  'This app is not a web page, so it cannot have a public address. Connect to it at its address and port over Tailscale.'

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
  buildTimeoutMinutes?: number
  triggerMode?: TriggerMode
  hostnames?: string[]
  strategy?: DeployStrategy
}

/** The settings an update may also change: storage, hardware, and an image app's image. */
export type ProjectPatch = ProjectSettings & StorageInput & { image?: string }

const IMAGE_PROBLEM =
  'Enter an image like jellyfin/jellyfin:12.4 or ghcr.io/owner/app:1.2 (lowercase, with a version tag).'

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
  if (
    clean.buildTimeoutMinutes !== undefined &&
    (!Number.isInteger(clean.buildTimeoutMinutes) ||
      clean.buildTimeoutMinutes < BUILD_TIMEOUT_MIN_MINUTES ||
      clean.buildTimeoutMinutes > BUILD_TIMEOUT_MAX_MINUTES)
  ) {
    throw new ProjectError(
      `The build time limit must be from ${BUILD_TIMEOUT_MIN_MINUTES} to ${BUILD_TIMEOUT_MAX_MINUTES} minutes.`,
    )
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

/**
 * Installs an app that runs a published image (D42): admins only, since an image can be any
 * software at all. It is private (on the Tailscale network) unless given public addresses, and
 * deploys by hand: "Update" pulls the image again.
 */
type ImageAppInput = ProjectSettings &
  StorageInput & {
    name: string
    image: string
    env?: Record<string, string>
    catalogId?: string
    web?: boolean
    ports?: { port: number; protocol: PortProtocol }[]
    /** The computer's own network (D54): only for a template that offers it. */
    hostNetwork?: boolean
    /** A USB stick for a template that needs one (D55), by its /dev/serial/by-id path. */
    device?: string
  }

/** Any published image, with the settings given (D42). Admins only. */
export async function createImageApp(
  ctx: Ctx,
  owner: ProjectOwner,
  input: ImageAppInput,
): Promise<Project> {
  if (owner.role !== 'admin') {
    throw new UserError(403, 'admin_only', 'Only an admin can install apps from an image.')
  }
  if (input.catalogId && !findTemplate(ctx, input.catalogId)) {
    throw new ProjectError('That app is not in the catalog.')
  }
  return insertImageApp(ctx, owner, input)
}

/**
 * A catalog template, installed as written (D43): the image, port, storage, and env vars come from
 * the template on the server, never from the request. Standard templates are open to every
 * account; elevated ones (a library, the graphics chip) need an admin.
 */
export async function installCatalogApp(
  ctx: Ctx,
  owner: ProjectOwner,
  catalogId: string,
  input: CatalogInstall,
): Promise<Project> {
  const template = findTemplate(ctx, catalogId)
  if (!template) throw new UserError(404, 'not_found', 'That app is not in the catalog.')
  if (template.tier !== 'standard' && owner.role !== 'admin') {
    throw new UserError(
      403,
      'admin_only',
      `${template.name} reads a folder on this computer or uses its hardware, so only an admin can install it.`,
      'Ask an admin to install it for you.',
    )
  }
  // Required answers (D52), such as a licence: every one must be accepted, by this request.
  const accepted = new Set(input.accepted ?? [])
  const unanswered = (template.questions ?? []).find((q) => !accepted.has(q.env))
  if (unanswered) {
    throw new ProjectError(`${unanswered.label} first.`, unanswered.hint)
  }
  const answers = Object.fromEntries((template.questions ?? []).map((q) => [q.env, q.value]))
  if (template.firstVisitorIsAdmin && input.hostnames?.length) {
    throw new ProjectError(
      `Finish setting up ${template.name} before putting it on the internet: whoever opens it first becomes its admin.`,
      'Install it privately, complete its setup, then add a public address under its Settings.',
    )
  }
  return insertImageApp(ctx, owner, {
    name: input.name,
    image: template.image,
    port: template.port,
    memoryLimitMb: input.memoryLimitMb ?? template.memoryLimitMb,
    ...(template.buildTimeoutMinutes ? { buildTimeoutMinutes: template.buildTimeoutMinutes } : {}),
    hostnames: input.hostnames,
    env: { ...template.env, ...answers },
    catalogId: template.id,
    volumes: template.volumes.map((v) => ({ name: v.name, mountPath: v.mountPath })),
    libraries:
      template.library && input.libraryId
        ? [{ libraryId: input.libraryId, mountPath: template.library.mountPath, writable: false }]
        : [],
    gpu: Boolean(template.gpu && input.gpu),
    hostNetwork: Boolean(template.hostNetwork && input.hostNetwork),
    ...(template.device && input.device ? { device: input.device } : {}),
  })
}

async function insertImageApp(
  ctx: Ctx,
  owner: ProjectOwner,
  input: ImageAppInput,
): Promise<Project> {
  const problem = checkProjectName(input.name)
  if (problem) throw new ProjectError(NAME_PROBLEMS[problem])
  if (!isValidImageRef(input.image)) throw new ProjectError(IMAGE_PROBLEM)
  if (
    owner.role !== 'admin' &&
    (await listProjectsOf(ctx.db, owner.id)).length >= MAX_PROJECTS_PER_MEMBER
  ) {
    throw new ProjectError(`An account can have at most ${MAX_PROJECTS_PER_MEMBER} projects.`)
  }
  const settings = cleanSettings({
    port: input.port,
    memoryLimitMb: input.memoryLimitMb,
    buildTimeoutMinutes: input.buildTimeoutMinutes,
  })
  const hostnames = cleanSettings({ hostnames: input.hostnames ?? [] }).hostnames!
  await checkHostnames(ctx, owner.role, null, hostnames)
  const storage = await cleanStorage(ctx, owner.role, input)
  // A template's ports and whether it is a web page (D51), or an admin's own choice for any
  // image; ports are an admin's to grant.
  const template = input.catalogId ? findTemplate(ctx, input.catalogId) : null
  const web = template ? template.web !== false : input.web !== false
  const ports = (template?.ports ?? input.ports ?? []).map((p) => ({
    port: p.port,
    protocol: p.protocol,
    hostPort: p.port,
  }))
  if (ports.length && owner.role !== 'admin') {
    throw new UserError(403, 'admin_only', 'Only an admin can give an app a port on this computer.')
  }
  if (!web && hostnames.length) throw new ProjectError(NOT_WEB_PROBLEM)
  // The computer's own network (D54): an admin's to grant, and only where a template offers it.
  const hostNetwork = Boolean(input.hostNetwork && template?.hostNetwork)
  if (hostNetwork && owner.role !== 'admin') {
    throw new UserError(
      403,
      'admin_only',
      'Only an admin can put an app on the computer’s own network.',
      'Install it without that option, or ask an admin.',
    )
  }
  await checkPorts(ctx, ports)
  // A template's USB stick (D55): required where the template asks for one, an admin's to give.
  const devices =
    template?.device && input.device
      ? [{ path: input.device, mountPath: template.device.mountPath }]
      : []
  if (template?.device && !devices.length) {
    throw new ProjectError(
      `${template.name} needs a ${template.device.label.toLowerCase()}. Plug it in and pick it.`,
    )
  }
  if (devices.length && owner.role !== 'admin') {
    throw new UserError(403, 'admin_only', 'Only an admin can give an app a USB device.')
  }
  for (const d of devices) await checkDevice(ctx, d.path)
  // Two containers can never hold the same port on the computer, so a new version waits for the
  // old one to stop.
  const hasStorage = Boolean(
    storage.volumes?.length ||
    storage.libraries?.length ||
    ports.length ||
    hostNetwork ||
    devices.length,
  )

  let project: Project
  try {
    project = await insertProject(ctx.db, {
      ...settings,
      ownerId: owner.id,
      name: input.name,
      kind: 'image',
      image: input.image,
      catalogId: input.catalogId ?? null,
      // Two copies of an app must never write to the same storage at once.
      strategy: input.strategy ?? (hasStorage ? 'recreate' : 'rolling'),
      gpu: storage.gpu ?? false,
      web,
      hostNetwork,
      repoUrl: '',
      branch: '',
      triggerMode: 'manual',
      hostnames,
    })
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === '23505') {
      throw new UserError(409, 'name_taken', `An app named "${input.name}" already exists.`)
    }
    throw error
  }
  await replaceAppStorage(ctx.db, project.id, storage)
  await insertAppDevices(ctx.db, project.id, devices)
  await insertAppPorts(ctx.db, project.id, ports).catch(async (error: unknown) => {
    // Taken a moment ago by another install.
    await deleteProjectRow(ctx.db, project.id)
    if ((error as { cause?: { code?: string } }).cause?.code === '23505') {
      throw new UserError(409, 'port_taken', 'Another app took one of these ports just now.')
    }
    throw error
  })
  // A stack template (D44): its services' kept folders, and secrets made for this install only.
  await insertServiceVolumes(
    ctx.db,
    project.id,
    (template?.services ?? []).flatMap((service) =>
      service.volumes.map((v) => ({ service: service.name, name: v.name, mountPath: v.mountPath })),
    ),
  )
  const env = {
    ...input.env,
    ...Object.fromEntries(
      (template?.secrets ?? []).map((key) => [key, randomBytes(24).toString('hex')]),
    ),
  }
  if (Object.keys(env).length) await setEnv(ctx, project.id, env)
  return project
}

/** Changes take effect on the next deploy. */
export async function updateProjectSettings(
  ctx: Ctx,
  role: UserRole,
  project: Project,
  patch: ProjectPatch,
): Promise<Project> {
  const { volumes, libraries, gpu, image, ...settings } = patch
  const clean = cleanSettings(settings)
  if (clean.hostnames?.length && !project.web) throw new ProjectError(NOT_WEB_PROBLEM)
  if (clean.hostnames) await checkHostnames(ctx, role, project.id, clean.hostnames)
  if (project.kind === 'image') {
    // An image app has no branch to follow; it updates when asked.
    delete clean.branch
    delete clean.rootDir
    if (clean.triggerMode && clean.triggerMode !== 'manual') {
      throw new ProjectError('Apps from an image update when you press Update.')
    }
  } else if (image !== undefined) {
    throw new ProjectError('This project is built from its repository, not an image.')
  }
  if (image !== undefined) {
    if (!isValidImageRef(image)) throw new ProjectError(IMAGE_PROBLEM)
    // A member may change the version of a standard catalog app, never what it runs (D43).
    if (role !== 'admin' && !isMemberCatalogApp(project.catalogId, image)) {
      throw new UserError(
        403,
        'admin_only',
        project.catalogId
          ? 'You can change the version, but only an admin can switch this app to another image.'
          : 'Only an admin can change the image an app runs.',
      )
    }
  }
  const current = {
    libraryIds: (await listAppLibraries(ctx.db, [project.id])).map((l) => l.libraryId),
    gpu: project.gpu,
  }
  const storage = await cleanStorage(ctx, role, { volumes, libraries, gpu }, current)
  if (storage.volumes) {
    const taken = (await listAppVolumes(ctx.db, [project.id])).filter((v) => v.service)
    const clash = storage.volumes.find((v) => taken.some((t) => t.name === v.name))
    if (clash) {
      throw new ProjectError(
        `"${clash.name}" is the name of storage that a part of this app uses. Pick another name.`,
      )
    }
  }
  // Storage added to an app that starts its new version first: stop the old one first instead,
  // unless this change chose the strategy itself.
  if (storage.volumes?.length && clean.strategy === undefined && project.strategy === 'rolling') {
    clean.strategy = 'recreate'
  }
  await updateProject(ctx.db, project.id, {
    ...clean,
    ...(image !== undefined ? { image } : {}),
    ...(storage.gpu !== undefined ? { gpu: storage.gpu } : {}),
  })
  await replaceAppStorage(ctx.db, project.id, storage)
  // Addresses are routes, so they apply right away rather than on the next deploy.
  if (clean.hostnames) {
    await syncRouting(ctx)
    await pruneAddressChecks(ctx, project.id, clean.hostnames)
    await ctx.queue.send('addresses', { projectId: project.id })
  }
  return (await getProject(ctx.db, project.id))!
}

/**
 * Whether a settings change altered the public addresses of a running app whose template passes
 * them in an env var (D48), so a new container must start with the new value.
 */
export function needsRestartForAddresses(ctx: Ctx, before: Project, after: Project): boolean {
  const template = after.catalogId ? findTemplate(ctx, after.catalogId) : null
  if (!template?.addressEnv || !after.currentDeploymentId || after.desiredState !== 'running') {
    return false
  }
  const key = (p: Project) => [...p.hostnames].sort().join(',')
  return key(before) !== key(after)
}

/**
 * Removes the project's containers, images, and records, cancelling any build in progress. Its
 * storage is kept unless `data` is `delete`: reinstalling an app of the same name picks it up.
 */
export async function deleteProject(
  ctx: Ctx,
  project: Project,
  data: 'keep' | 'delete' = 'keep',
): Promise<void> {
  // A running build would otherwise finish and leave an image behind (cleanup removes images of
  // deleted projects later, but cancelling stops the work now).
  await cancelAllActive(ctx, project)
  await withAdvisoryLock(ctx.db, projectLockKey(project.id), async () => {
    // The project is going away, so its containers are removed at once rather than stopped
    // gracefully (which can take ten seconds each for an app that ignores SIGTERM).
    for (const container of await ctx.docker.listManagedApps(project.id)) {
      await ctx.docker.removeContainer(container.id)
    }
    // A stack's services stop gracefully: a database whose data is kept must shut down cleanly.
    await removeStack(ctx, project.id)
    if (data === 'delete') await deleteAppVolumes(ctx, project)
    await deleteProjectRow(ctx.db, project.id)
  })
  await syncRouting(ctx)
  for (const tag of await ctx.docker.listTags(appImageRepository(project.name))) {
    await ctx.docker.removeImage(tag).catch((error: unknown) => {
      ctx.log.warn({ err: error, image: tag }, 'Could not remove image of deleted project')
    })
  }
  // The image as pulled (jellyfin/jellyfin:12.4), unless another app runs it too.
  if (project.image && !(await listProjects(ctx.db)).some((p) => p.image === project.image)) {
    await ctx.docker.untagImage(project.image).catch(() => {})
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
  const [latest, current, recent, checks, volumes, libraries] = await Promise.all([
    listLatestDeployments(ctx.db, ids),
    listDeploymentsById(ctx.db, currentIds),
    listRecentStatuses(ctx.db, ids, RUNWAY_LIGHTS),
    listAddressChecks(ctx, ids),
    listAppVolumes(ctx.db, ids),
    listAppLibraries(ctx.db, ids),
  ])
  const ports = await listAppPorts(ctx.db, ids)
  const devices = await listAppDevices(ctx.db, ids)
  const host = ports.length ? await portHost(ctx) : { ip: null, name: null }
  return projects.map((p) => {
    const latestRow = latest.find((d) => d.projectId === p.id)
    const currentRow = current.find((d) => d.id === p.currentDeploymentId)
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      image: p.image,
      catalogId: p.catalogId,
      strategy: p.strategy,
      gpu: p.gpu,
      web: p.web,
      hostNetwork: p.hostNetwork,
      devices: devices
        .filter((d) => d.projectId === p.id)
        .map((d) => ({ path: d.path, name: serialDeviceName(d.path), mountPath: d.mountPath })),
      ports: ports
        .filter((port) => port.projectId === p.id)
        .map(({ port, protocol, hostPort }) => ({
          port,
          protocol,
          hostPort,
          address: portAddress(host, hostPort),
        })),
      volumes: volumes
        .filter((v) => v.projectId === p.id && !v.service)
        .map(({ name, mountPath }) => ({ name, mountPath })),
      libraries: libraries
        .filter((l) => l.projectId === p.id)
        .map((l) => ({
          libraryId: l.libraryId,
          name: l.name,
          mountPath: l.mountPath,
          readOnly: !(l.writable && l.libraryWritable),
        })),
      repoUrl: p.repoUrl,
      branch: p.branch,
      rootDir: p.rootDir,
      port: p.port,
      memoryLimitMb: p.memoryLimitMb,
      buildTimeoutMinutes: p.buildTimeoutMinutes,
      triggerMode: p.triggerMode,
      desiredState: p.desiredState,
      url: p.web && settings.lanDomain ? `http://${appHostname(p.name, settings.lanDomain)}` : null,
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
/** A part of a stack app by its template name; only those, so never any other container. */
export function checkPart(ctx: Ctx, project: Project, part: string): string {
  if (!stackServices(ctx, project).some((s) => s.name === part)) {
    throw new UserError(404, 'not_found', `This app has no part named ${part}.`)
  }
  return part
}

export async function followRuntimeLogs(
  ctx: Ctx,
  project: Project,
  signal: AbortSignal,
  part?: string,
) {
  // A stack's supporting part (D44).
  if (part) {
    const name = serviceContainerName(project.name, checkPart(ctx, project, part))
    const state = await ctx.docker.serviceState(name)
    return state?.running ? ctx.docker.followLogs(name, RUNTIME_LOG_TAIL, signal) : null
  }
  const [container] = (await ctx.docker.listManagedApps(project.id)).filter(
    (c) => c.deploymentId === project.currentDeploymentId,
  )
  return container ? ctx.docker.followLogs(container.id, RUNTIME_LOG_TAIL, signal) : null
}
