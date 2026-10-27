import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { deployments, projects } from '../../db/schema.ts'

/** Each project with the deployment currently serving it, if any. */
export async function listProjectRoutes(db: Db) {
  return db
    .select({
      name: projects.name,
      desiredState: projects.desiredState,
      deploymentNumber: deployments.number,
      port: deployments.port,
    })
    .from(projects)
    .leftJoin(deployments, eq(projects.currentDeploymentId, deployments.id))
    .orderBy(projects.name)
}
