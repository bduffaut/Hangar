import { and, eq, inArray, or } from 'drizzle-orm'
import type { PortProtocol } from '@hangar/shared'
import type { Db } from '../../db/client.ts'
import { appPorts, projects, users } from '../../db/schema.ts'

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

/** Every port held on the computer, with its app and owner, by port. */
export async function listAllPorts(db: Db) {
  return db
    .select({
      app: projects.name,
      owner: users.username,
      port: appPorts.port,
      protocol: appPorts.protocol,
      hostPort: appPorts.hostPort,
    })
    .from(appPorts)
    .innerJoin(projects, eq(projects.id, appPorts.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .orderBy(appPorts.hostPort, appPorts.protocol)
}

export async function insertAppPorts(
  db: Db,
  projectId: string,
  ports: { port: number; protocol: PortProtocol; hostPort: number }[],
): Promise<void> {
  if (!ports.length) return
  await db.insert(appPorts).values(ports.map((p) => ({ projectId, ...p })))
}
