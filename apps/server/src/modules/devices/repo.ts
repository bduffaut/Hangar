import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { appDevices, projects } from '../../db/schema.ts'

export type AppDevice = typeof appDevices.$inferSelect

export async function listAppDevices(db: Db, projectIds: string[]): Promise<AppDevice[]> {
  if (!projectIds.length) return []
  return db.select().from(appDevices).where(inArray(appDevices.projectId, projectIds))
}

export async function insertAppDevices(
  db: Db,
  projectId: string,
  devices: { path: string; mountPath: string }[],
): Promise<void> {
  if (!devices.length) return
  await db.insert(appDevices).values(devices.map((d) => ({ projectId, ...d })))
}

/** For each device path, the names of the apps that use it. */
export async function deviceUsage(db: Db): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ path: appDevices.path, app: projects.name })
    .from(appDevices)
    .innerJoin(projects, eq(projects.id, appDevices.projectId))
  const usage = new Map<string, string[]>()
  for (const row of rows) usage.set(row.path, [...(usage.get(row.path) ?? []), row.app])
  return usage
}
