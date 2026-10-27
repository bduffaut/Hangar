import type { DeploymentStatus, DeploymentTrigger, LogStream } from '@hangar/shared'
import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { deploymentLogs, deployments, projects } from '../../db/schema.ts'

export type Deployment = typeof deployments.$inferSelect
export type DeploymentPatch = Partial<Omit<typeof deployments.$inferInsert, 'id' | 'status'>>

export async function getDeployment(db: Db, id: string): Promise<Deployment | null> {
  const [row] = await db.select().from(deployments).where(eq(deployments.id, id))
  return row ?? null
}

export async function getDeploymentByNumber(
  db: Db,
  projectId: string,
  number: number,
): Promise<Deployment | null> {
  const [row] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.projectId, projectId), eq(deployments.number, number)))
  return row ?? null
}

export async function listDeployments(db: Db, projectId: string, limit = 20) {
  return db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, projectId))
    .orderBy(desc(deployments.number))
    .limit(limit)
}

export async function listDeploymentsByStatus(db: Db, statuses: DeploymentStatus[]) {
  return db.select().from(deployments).where(inArray(deployments.status, statuses))
}

export interface NewDeployment {
  projectId: string
  commitSha: string
  branch: string
  trigger: DeploymentTrigger
  commitMessage?: string | null
  commitAuthor?: string | null
  imageTag?: string | null
  sourceDeploymentId?: string | null
}

/**
 * Inserts a queued deployment with the project's next number. Any deployment still queued for the
 * project is superseded in the same transaction; their IDs are returned.
 */
export async function insertQueuedDeployment(db: Db, values: NewDeployment) {
  return db.transaction(async (tx) => {
    const superseded = await tx
      .update(deployments)
      .set({ status: 'cancelled', failureCode: 'superseded', finishedAt: new Date() })
      .where(and(eq(deployments.projectId, values.projectId), eq(deployments.status, 'queued')))
      .returning({ id: deployments.id })
    const [project] = await tx
      .update(projects)
      .set({ nextDeploymentNumber: sql`${projects.nextDeploymentNumber} + 1` })
      .where(eq(projects.id, values.projectId))
      .returning({ number: sql<number>`${projects.nextDeploymentNumber} - 1` })
    if (!project) throw new Error(`Project ${values.projectId} not found`)
    const [deployment] = await tx
      .insert(deployments)
      .values({ ...values, number: project.number, status: 'queued' })
      .returning()
    return { deployment: deployment!, superseded: superseded.map((row) => row.id) }
  })
}

/**
 * Moves a deployment from one status to another only if it is still in `from`. Returns null when
 * another actor already moved it; the caller should then stop.
 */
export async function updateDeploymentStatus(
  db: Db,
  id: string,
  from: DeploymentStatus,
  to: DeploymentStatus,
  patch: DeploymentPatch = {},
): Promise<Deployment | null> {
  const [row] = await db
    .update(deployments)
    .set({ ...patch, status: to })
    .where(and(eq(deployments.id, id), eq(deployments.status, from)))
    .returning()
  return row ?? null
}

export async function updateDeployment(db: Db, id: string, patch: DeploymentPatch): Promise<void> {
  await db.update(deployments).set(patch).where(eq(deployments.id, id))
}

/** Makes the deployment the project's live one and marks it ready, atomically. */
export async function markDeploymentLive(db: Db, deployment: Deployment): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(deployments)
      .set({ status: 'ready', finishedAt: new Date() })
      .where(and(eq(deployments.id, deployment.id), eq(deployments.status, 'deploying')))
      .returning({ id: deployments.id })
    if (!row) return false
    await tx
      .update(projects)
      .set({ currentDeploymentId: deployment.id, desiredState: 'running' })
      .where(eq(projects.id, deployment.projectId))
    return true
  })
}

/** Deployments of a project that have an image, newest first. */
export async function listImages(db: Db, projectId: string) {
  return db
    .select({ id: deployments.id, imageTag: deployments.imageTag, status: deployments.status })
    .from(deployments)
    .where(and(eq(deployments.projectId, projectId), isNotNull(deployments.imageTag)))
    .orderBy(desc(deployments.number))
}

export interface LogLine {
  seq: number
  stream: LogStream
  line: string
  ts: Date
}

export async function appendLogs(db: Db, deploymentId: string, lines: LogLine[]): Promise<void> {
  if (lines.length === 0) return
  await db.insert(deploymentLogs).values(lines.map((line) => ({ ...line, deploymentId })))
}

export async function listLogs(db: Db, deploymentId: string, afterSeq = -1) {
  return db
    .select({
      seq: deploymentLogs.seq,
      stream: deploymentLogs.stream,
      line: deploymentLogs.line,
      ts: deploymentLogs.ts,
    })
    .from(deploymentLogs)
    .where(and(eq(deploymentLogs.deploymentId, deploymentId), gt(deploymentLogs.seq, afterSeq)))
    .orderBy(deploymentLogs.seq)
}

/** Deletes build logs of all but the newest `keep` deployments of each project. */
export async function pruneLogs(db: Db, keep: number): Promise<number> {
  const result = await db.execute(sql`
    delete from ${deploymentLogs} where ${deploymentLogs.deploymentId} in (
      select id from (
        select id, row_number() over (partition by project_id order by number desc) as rank
        from ${deployments}
      ) ranked where rank > ${keep}
    )`)
  return result.rowCount ?? 0
}
