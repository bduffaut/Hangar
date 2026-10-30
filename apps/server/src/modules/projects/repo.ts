import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { deployments, projects } from '../../db/schema.ts'

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

/** Each project with the deployment currently serving it, if any. */
export async function listProjectRoutes(db: Db) {
  return db
    .select({
      name: projects.name,
      domains: projects.domains,
      desiredState: projects.desiredState,
      deploymentNumber: deployments.number,
      port: deployments.port,
    })
    .from(projects)
    .leftJoin(deployments, eq(projects.currentDeploymentId, deployments.id))
    .orderBy(projects.name)
}

/** Projects that have a current deployment (or just `projectId`'s), with that deployment. */
export async function listCurrentDeployments(db: Db, projectId?: string) {
  return db
    .select({ project: projects, deployment: deployments })
    .from(projects)
    .innerJoin(deployments, eq(projects.currentDeploymentId, deployments.id))
    .where(projectId ? eq(projects.id, projectId) : undefined)
}

export async function listProjects(db: Db): Promise<Project[]> {
  return db.select().from(projects).orderBy(projects.name)
}

export async function getProject(db: Db, id: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id))
  return row ?? null
}

export async function getProjectByName(db: Db, name: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.name, name))
  return row ?? null
}

export async function insertProject(db: Db, values: NewProject): Promise<Project> {
  const [row] = await db.insert(projects).values(values).returning()
  return row!
}

export async function updateProject(
  db: Db,
  id: string,
  patch: Partial<Omit<NewProject, 'id'>>,
): Promise<void> {
  await db.update(projects).set(patch).where(eq(projects.id, id))
}

export async function deleteProject(db: Db, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id))
}
