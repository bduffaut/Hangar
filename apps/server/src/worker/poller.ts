import type { Ctx } from '../context.ts'
import { queueDeployment } from '../modules/deployments/service.ts'
import { listProjects, updateProject } from '../modules/projects/repo.ts'
import { getSettings } from '../modules/settings/repo.ts'
import { getGithubToken } from '../modules/settings/secrets.ts'

const MAX_BACKOFF_MS = 30 * 60_000
const BASE_BACKOFF_MS = 60_000

// Per-project backoff after failed checks, so an unreachable repository is not hammered.
// In memory: a restart retries everything once, which is fine.
const backoff = new Map<string, { failures: number; until: number }>()

/**
 * LAN mode: checks each polled project's branch head with `git ls-remote` (not the GitHub API,
 * which allows only 60 unauthenticated requests an hour) and deploys new commits.
 */
export async function pollProjects(ctx: Ctx): Promise<void> {
  const token = await getGithubToken(ctx)
  const { publicDomain } = await getSettings(ctx.db)
  // A stopped app stays stopped: new commits wait until it is started or deployed by hand.
  // Webhook projects are polled too while there is no public domain for GitHub to reach.
  const projects = (await listProjects(ctx.db)).filter(
    (p) =>
      p.desiredState === 'running' &&
      (p.triggerMode === 'poll' || (p.triggerMode === 'webhook' && !publicDomain)),
  )
  for (const project of projects) {
    const state = backoff.get(project.id)
    if (state && Date.now() < state.until) continue
    try {
      const sha = await ctx.git.headOf(project.repoUrl, project.branch, token)
      backoff.delete(project.id)
      if (!sha || sha === project.lastSeenSha) continue
      if (project.lastSeenSha === null) {
        // First look at this branch; deploys are started explicitly when a project is created.
        await updateProject(ctx.db, project.id, { lastSeenSha: sha })
        continue
      }
      ctx.log.info({ project: project.name, sha }, 'New commit found; deploying')
      await queueDeployment(ctx, project, { commitSha: sha, trigger: 'poll' })
    } catch (error) {
      const failures = (state?.failures ?? 0) + 1
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS)
      backoff.set(project.id, { failures, until: Date.now() + delay })
      ctx.log.warn(
        { err: error, project: project.name, retryInSeconds: delay / 1000 },
        'Could not check the branch for new commits',
      )
    }
  }
}
