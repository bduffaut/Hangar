import { and, eq, inArray, or } from 'drizzle-orm'
import type { PortProtocol } from '@hangar/shared'
import type { Db } from '../../db/client.ts'
import { appPorts, projects } from '../../db/schema.ts'

export type AppPort = typeof appPorts.$inferSelect

export async function listAppPorts(db: Db, projectIds: string[]): Promise<AppPort[]> {
  if (!projectIds.length) return []
  return db.select().from(appPorts).where(inArray(appPorts.projectId, projectIds))
}

/** The apps that already hold any of these ports on the computer. */
export async function portHolders(
  db: Db,
  wanted: { hostPort: number; protocol: PortProtocol }[],
): Promise<{ hostPort: number; protocol: PortProtocol; app: string }[]> {
  if (!wanted.length) return []
  return db
    .select({ hostPort: appPorts.hostPort, protocol: appPorts.protocol, app: projects.name })
    .from(appPorts)
    .innerJoin(projects, eq(projects.id, appPorts.projectId))
    .where(
      or(
        ...wanted.map((w) =>
          and(eq(appPorts.hostPort, w.hostPort), eq(appPorts.protocol, w.protocol)),
        ),
      ),
    )
}

export async function insertAppPorts(
  db: Db,
  projectId: string,
  ports: { port: number; protocol: PortProtocol; hostPort: number }[],
): Promise<void> {
  if (!ports.length) return
  await db.insert(appPorts).values(ports.map((p) => ({ projectId, ...p })))
}
