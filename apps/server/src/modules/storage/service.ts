import {
  checkLibraryPath,
  checkMountPath,
  isMemberCatalogApp,
  libraryPathProblemCopy,
  type LibraryView,
  MAX_LIBRARIES,
  type StorageView,
  type UserRole,
} from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { listAppDevices } from '../devices/repo.ts'
import { listAppPorts } from '../ports/repo.ts'
import { conflict, notFound, UserError } from '../../errors.ts'
import type { AppMount } from '../../platform/docker.ts'
import { checkHostFolder } from '../../platform/host.ts'
import { listProjects, type Project } from '../projects/repo.ts'
import {
  type AppLibraryMount,
  deleteLibrary as deleteLibraryRow,
  getLibrary,
  insertLibrary,
  type Library,
  libraryUsage,
  listAppLibraries,
  listAppVolumes,
  listLibraries,
  updateLibrary as updateLibraryRow,
} from './repo.ts'

// Storage and libraries (D42). Volumes are Docker volumes named after the app, kept across
// deploys and, unless asked, after the app is deleted. Libraries are folders on the computer an
// admin registers; apps mount them by id, never by a path a user typed.

export class StorageError extends UserError {
  constructor(message: string, hint?: string) {
    super(400, 'invalid_storage', message, hint)
  }
}

/** The Docker volume holding an app's storage folder `name`. */
export const dataVolumeName = (app: string, name: string) => `hangar-data-${app}-${name}`

// Libraries

async function libraryViews(ctx: Ctx, rows: Library[]): Promise<LibraryView[]> {
  const usage = await libraryUsage(ctx.db)
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    path: l.path,
    writable: l.writable,
    usedBy: usage.get(l.id) ?? [],
    createdAt: l.createdAt.toISOString(),
  }))
}

export async function libraryList(ctx: Ctx): Promise<LibraryView[]> {
  return libraryViews(ctx, await listLibraries(ctx.db))
}

/** Checks the folder, on paper and on the computer, then registers it. */
async function checkFolder(ctx: Ctx, path: string): Promise<void> {
  const problem = checkLibraryPath(path)
  if (problem) throw new StorageError(libraryPathProblemCopy[problem])
  const found = await checkHostFolder(ctx, path)
  if (found.ok) return
  if (found.problem === 'link') {
    throw new StorageError(
      `${found.link} is a link, so the folder could change underneath its apps.`,
      'Use the real folder it points to instead (ls -l shows where it leads).',
    )
  }
  throw new StorageError(
    `There is no folder at ${path} on this computer.`,
    'Create it first (sudo mkdir -p, then copy your files in), or check the spelling: paths are case-sensitive.',
  )
}

export async function createLibrary(
  ctx: Ctx,
  input: { name: string; path: string; writable?: boolean },
): Promise<LibraryView> {
  const path = input.path.trim().replace(/\/+$/, '') || '/'
  const existing = await listLibraries(ctx.db)
  if (existing.length >= MAX_LIBRARIES) {
    throw new StorageError(`Hangar can keep at most ${MAX_LIBRARIES} libraries.`)
  }
  if (existing.some((l) => l.name.toLowerCase() === input.name.toLowerCase())) {
    throw conflict('library_taken', `There is already a library named ${input.name}.`)
  }
  if (existing.some((l) => l.path === path)) {
    throw conflict('library_taken', `${path} is already a library.`)
  }
  await checkFolder(ctx, path)
  const row = await insertLibrary(ctx.db, {
    name: input.name,
    path,
    writable: input.writable ?? false,
  })
  return (await libraryViews(ctx, [row]))[0]!
}

export async function updateLibrary(
  ctx: Ctx,
  id: string,
  patch: { name?: string; writable?: boolean },
): Promise<LibraryView> {
  const library = await getLibrary(ctx.db, id)
  if (!library) throw notFound('Library')
  if (patch.name && patch.name.toLowerCase() !== library.name.toLowerCase()) {
    const taken = (await listLibraries(ctx.db)).some(
      (l) => l.name.toLowerCase() === patch.name!.toLowerCase(),
    )
    if (taken) throw conflict('library_taken', `There is already a library named ${patch.name}.`)
  }
  await updateLibraryRow(ctx.db, id, patch)
  return (await libraryViews(ctx, [(await getLibrary(ctx.db, id))!]))[0]!
}

export async function deleteLibrary(ctx: Ctx, id: string): Promise<void> {
  const library = await getLibrary(ctx.db, id)
  if (!library) throw notFound('Library')
  const usedBy = (await libraryUsage(ctx.db)).get(id) ?? []
  if (usedBy.length) {
    throw conflict(
      'library_in_use',
      `${library.name} is used by ${usedBy.join(', ')}.`,
      'Remove it from those apps first. Removing a library never deletes its files.',
    )
  }
  await deleteLibraryRow(ctx.db, id)
}

// An app's storage settings

export interface StorageInput {
  volumes?: { name: string; mountPath: string }[]
  libraries?: { libraryId: string; mountPath: string; writable?: boolean }[]
  gpu?: boolean
}

/**
 * Validates an app's storage and hardware settings, and who may set them: anyone can give an app
 * storage; libraries and the graphics chip are for admins. Returns the lists to save.
 */
export async function cleanStorage(
  ctx: Ctx,
  role: UserRole,
  input: StorageInput,
  current: { libraryIds: string[]; gpu: boolean } = { libraryIds: [], gpu: false },
) {
  const targets = new Set<string>()
  const claim = (target: string) => {
    const problem = checkMountPath(target)
    if (problem === 'invalid') {
      throw new StorageError(`"${target}" is not a folder path inside the app, like /data.`)
    }
    if (problem === 'reserved') {
      throw new StorageError(`${target} belongs to the container's system. Pick another folder.`)
    }
    const nested = [...targets].find(
      (t) => t === target || t.startsWith(`${target}/`) || target.startsWith(`${t}/`),
    )
    if (nested) throw new StorageError(`${target} overlaps ${nested}. Give each its own folder.`)
    targets.add(target)
  }

  const volumes = input.volumes?.map((v) => {
    claim(v.mountPath)
    return { name: v.name, mountPath: v.mountPath }
  })
  if (volumes && new Set(volumes.map((v) => v.name)).size !== volumes.length) {
    throw new StorageError('Each storage folder needs its own name.')
  }

  let libraries: { libraryId: string; mountPath: string; writable: boolean }[] | undefined
  if (input.libraries) {
    // Members may keep what an admin gave them, but cannot add or change libraries.
    const changed = input.libraries.some((l) => !current.libraryIds.includes(l.libraryId))
    if (changed && role !== 'admin') {
      throw new UserError(403, 'admin_only', 'Only an admin can share a library with an app.')
    }
    const known = new Map((await listLibraries(ctx.db)).map((l) => [l.id, l]))
    libraries = input.libraries.map((l) => {
      const library = known.get(l.libraryId)
      if (!library) throw new StorageError('That library no longer exists.')
      claim(l.mountPath)
      if (l.writable && !library.writable) {
        throw new StorageError(
          `${library.name} is read-only for apps.`,
          'An admin can allow writing in Settings → Storage.',
        )
      }
      return { libraryId: l.libraryId, mountPath: l.mountPath, writable: l.writable ?? false }
    })
  }

  if (input.gpu && !current.gpu && role !== 'admin') {
    throw new UserError(403, 'admin_only', 'Only an admin can give an app the graphics chip.')
  }
  return { volumes, libraries, gpu: input.gpu }
}

/**
 * Whether an app uses anything only an admin can grant (checked again at every deploy): the
 * graphics chip, a library, a port on the computer (D51), or a published image other than a
 * standard catalog template's (D43).
 */
export async function needsAdmin(ctx: Ctx, project: Project): Promise<boolean> {
  if (project.gpu || project.hostNetwork) return true
  if (project.kind === 'image' && !isMemberCatalogApp(project.catalogId, project.image)) return true
  if ((await listAppPorts(ctx.db, [project.id])).length > 0) return true
  if ((await listAppDevices(ctx.db, [project.id])).length > 0) return true
  return (await listAppLibraries(ctx.db, [project.id])).length > 0
}

/**
 * The mounts for an app's container, or for one of its stack services (D44). Makes sure each
 * storage volume exists and belongs to this app's account, and checks each library folder again
 * (it may have been replaced by a link). Libraries go to the app's own container only.
 */
export async function resolveMounts(
  ctx: Ctx,
  project: Project,
  service: string | null = null,
): Promise<AppMount[]> {
  const mounts: AppMount[] = []
  const volumes = (await listAppVolumes(ctx.db, [project.id])).filter(
    (v) => (v.service ?? null) === service,
  )
  for (const volume of volumes) {
    const name = dataVolumeName(project.name, volume.name)
    if (!(await ctx.docker.ensureDataVolume(name, project.name, project.ownerId))) {
      throw new StorageError(
        `The storage ${name} belongs to an app another account deleted.`,
        'An admin can remove it under Settings → Storage, or give this app another name.',
      )
    }
    mounts.push({ type: 'volume', source: name, target: volume.mountPath, readOnly: false })
  }
  if (service !== null) return mounts
  for (const library of await listAppLibraries(ctx.db, [project.id])) {
    const found = await checkHostFolder(ctx, library.path)
    if (!found.ok) {
      throw new StorageError(
        found.problem === 'link'
          ? `The library ${library.name} (${library.path}) now goes through a link, ${found.link}.`
          : `The library ${library.name} is missing: there is no folder at ${library.path}.`,
        'Check the folder (an external drive may be unplugged), then update the app again.',
      )
    }
    mounts.push({
      type: 'bind',
      source: library.path,
      target: library.mountPath,
      readOnly: !(library.writable && library.libraryWritable),
    })
  }
  return mounts
}

// Sizes, measured at most every few minutes: Docker walks every volume to report them.

const SIZE_CACHE_MS = 3 * 60_000
let sizes: { value: Map<string, number>; at: number } | null = null
let measuring: Promise<Map<string, number>> | null = null

async function volumeSizes(ctx: Ctx): Promise<Map<string, number>> {
  if (sizes && Date.now() - sizes.at < SIZE_CACHE_MS) return sizes.value
  measuring ??= ctx.docker
    .dataVolumeSizes()
    .then((value) => {
      sizes = { value, at: Date.now() }
      return value
    })
    .catch((error: unknown) => {
      ctx.log.warn({ err: error }, 'Could not measure storage')
      return sizes?.value ?? new Map<string, number>()
    })
    .finally(() => (measuring = null))
  return measuring
}

export async function storageView(ctx: Ctx, project: Project): Promise<StorageView> {
  const [volumes, libraries, measured] = await Promise.all([
    listAppVolumes(ctx.db, [project.id]),
    listAppLibraries(ctx.db, [project.id]),
    volumeSizes(ctx),
  ])
  return {
    volumes: volumes.map((v) => {
      const dockerName = dataVolumeName(project.name, v.name)
      return {
        name: v.name,
        mountPath: v.mountPath,
        service: v.service,
        dockerName,
        sizeBytes: measured.get(dockerName) ?? null,
      }
    }),
    libraries: libraries.map((l: AppLibraryMount) => ({
      libraryId: l.libraryId,
      name: l.name,
      path: l.path,
      mountPath: l.mountPath,
      readOnly: !(l.writable && l.libraryWritable),
    })),
  }
}

/** Every data volume on the computer, and whether a current app still uses it. */
export async function volumeList(ctx: Ctx) {
  const [all, projects, measured] = await Promise.all([
    ctx.docker.listDataVolumes(),
    listProjects(ctx.db),
    volumeSizes(ctx),
  ])
  const inUse = new Set<string>()
  for (const volume of await listAppVolumes(
    ctx.db,
    projects.map((p) => p.id),
  )) {
    const project = projects.find((p) => p.id === volume.projectId)!
    inUse.add(dataVolumeName(project.name, volume.name))
  }
  return all
    .map((v) => ({
      dockerName: v.name,
      app: v.app,
      orphaned: !inUse.has(v.name),
      sizeBytes: measured.get(v.name) ?? null,
    }))
    .sort((a, b) => a.dockerName.localeCompare(b.dockerName))
}

/** Removes the kept data of a deleted app. Data an app still uses cannot be removed here. */
export async function deleteOrphanVolume(ctx: Ctx, name: string): Promise<void> {
  const volume = (await volumeList(ctx)).find((v) => v.dockerName === name)
  if (!volume) throw notFound('Storage')
  if (!volume.orphaned) {
    throw conflict(
      'storage_in_use',
      `${volume.app ?? 'An app'} still uses this storage.`,
      "Remove it from the app's settings, or delete the app with its data.",
    )
  }
  await ctx.docker.removeVolume(name)
  sizes = null
}

/** Removes an app's storage volumes, for "delete the app and its data". */
export async function deleteAppVolumes(ctx: Ctx, project: Project): Promise<void> {
  for (const volume of await listAppVolumes(ctx.db, [project.id])) {
    await ctx.docker.removeVolume(dataVolumeName(project.name, volume.name))
  }
  sizes = null
}
