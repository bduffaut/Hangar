import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { appLibraries, appVolumes, libraries, projects } from '../../db/schema.ts'

export type Library = typeof libraries.$inferSelect
export type AppVolume = typeof appVolumes.$inferSelect
export type AppLibrary = typeof appLibraries.$inferSelect

export const listLibraries = (db: Db): Promise<Library[]> =>
  db.select().from(libraries).orderBy(asc(libraries.name))

export async function getLibrary(db: Db, id: string): Promise<Library | null> {
  const [row] = await db.select().from(libraries).where(eq(libraries.id, id))
  return row ?? null
}

export async function insertLibrary(
  db: Db,
  values: { name: string; path: string; writable: boolean },
): Promise<Library> {
  const [row] = await db.insert(libraries).values(values).returning()
  return row!
}

export async function updateLibrary(
  db: Db,
  id: string,
  patch: Partial<Pick<Library, 'name' | 'writable'>>,
): Promise<void> {
  await db.update(libraries).set(patch).where(eq(libraries.id, id))
}

export async function deleteLibrary(db: Db, id: string): Promise<void> {
  await db.delete(libraries).where(eq(libraries.id, id))
}

/** For each library, the names of the apps that use it. */
export async function libraryUsage(db: Db): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ libraryId: appLibraries.libraryId, app: projects.name })
    .from(appLibraries)
    .innerJoin(projects, eq(appLibraries.projectId, projects.id))
    .orderBy(asc(projects.name))
  const usage = new Map<string, string[]>()
  for (const row of rows) usage.set(row.libraryId, [...(usage.get(row.libraryId) ?? []), row.app])
  return usage
}

/** Kept folders of an app's stack services (D44), made at install from the template. */
export async function insertServiceVolumes(
  db: Db,
  projectId: string,
  volumes: { service: string; name: string; mountPath: string }[],
): Promise<void> {
  if (volumes.length) await db.insert(appVolumes).values(volumes.map((v) => ({ ...v, projectId })))
}

export async function listAppVolumes(db: Db, projectIds: string[]): Promise<AppVolume[]> {
  if (projectIds.length === 0) return []
  return db
    .select()
    .from(appVolumes)
    .where(inArray(appVolumes.projectId, projectIds))
    .orderBy(asc(appVolumes.name))
}

/** An app's library mounts, with each library's name, folder, and whether it allows writing. */
export async function listAppLibraries(db: Db, projectIds: string[]) {
  if (projectIds.length === 0) return []
  return db
    .select({
      projectId: appLibraries.projectId,
      libraryId: appLibraries.libraryId,
      mountPath: appLibraries.mountPath,
      writable: appLibraries.writable,
      name: libraries.name,
      path: libraries.path,
      libraryWritable: libraries.writable,
    })
    .from(appLibraries)
    .innerJoin(libraries, eq(appLibraries.libraryId, libraries.id))
    .where(inArray(appLibraries.projectId, projectIds))
    .orderBy(asc(appLibraries.mountPath))
}
export type AppLibraryMount = Awaited<ReturnType<typeof listAppLibraries>>[number]

/** Replaces an app's own storage and library lists (each only when given); services keep theirs. */
export async function replaceAppStorage(
  db: Db,
  projectId: string,
  storage: {
    volumes?: { name: string; mountPath: string }[]
    libraries?: { libraryId: string; mountPath: string; writable: boolean }[]
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (storage.volumes) {
      await tx
        .delete(appVolumes)
        .where(and(eq(appVolumes.projectId, projectId), isNull(appVolumes.service)))
      if (storage.volumes.length) {
        await tx.insert(appVolumes).values(storage.volumes.map((v) => ({ ...v, projectId })))
      }
    }
    if (storage.libraries) {
      await tx.delete(appLibraries).where(eq(appLibraries.projectId, projectId))
      if (storage.libraries.length) {
        await tx.insert(appLibraries).values(storage.libraries.map((l) => ({ ...l, projectId })))
      }
    }
  })
}
