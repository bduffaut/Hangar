import {
  ACTIVE_DEPLOYMENT_STATUSES,
  IMAGES_KEPT_PER_PROJECT,
  LOGS_KEPT_PER_PROJECT,
} from '@hangar/shared'
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Ctx } from '../context.ts'
import { listDeploymentsByStatus, listImages, pruneLogs } from '../modules/deployments/repo.ts'
import { listProjects } from '../modules/projects/repo.ts'

const isActive = (status: string) =>
  (ACTIVE_DEPLOYMENT_STATUSES as readonly string[]).includes(status)

/**
 * Keeps each project's newest images plus any image a current or in-flight deployment needs,
 * prunes old build logs, and removes build directories nothing is using.
 */
export async function collectGarbage(ctx: Ctx): Promise<void> {
  let removedImages = 0
  for (const project of await listProjects(ctx.db)) {
    const images = await listImages(ctx.db, project.id)
    const keep = new Set<string>()
    for (const image of images) {
      const recent = keep.size < IMAGES_KEPT_PER_PROJECT
      if (recent || image.id === project.currentDeploymentId || isActive(image.status)) {
        keep.add(image.imageTag!)
      }
    }
    for (const tag of await ctx.docker.listTags(`hangar/${project.name}`)) {
      if (keep.has(tag)) continue
      try {
        await ctx.docker.removeImage(tag)
        removedImages++
      } catch (error) {
        // Usually still used by a container; it will go on a later run.
        ctx.log.debug({ err: error, image: tag }, 'Kept an image that could not be removed')
      }
    }
  }

  const prunedLogs = await pruneLogs(ctx.db, LOGS_KEPT_PER_PROJECT)
  const removedDirs = await sweepBuildDirs(ctx)
  ctx.log.info({ removedImages, prunedLogs, removedDirs }, 'Cleanup finished')
}

/** Removes build directories that do not belong to a deployment still in progress. */
export async function sweepBuildDirs(ctx: Ctx): Promise<number> {
  const entries = await readdir(ctx.config.buildDir).catch(() => [])
  if (entries.length === 0) return 0
  const active = new Set(
    (await listDeploymentsByStatus(ctx.db, [...ACTIVE_DEPLOYMENT_STATUSES])).map((d) => d.id),
  )
  let removed = 0
  for (const entry of entries) {
    if (active.has(entry)) continue
    await rm(path.join(ctx.config.buildDir, entry), { recursive: true, force: true })
    removed++
  }
  return removed
}
