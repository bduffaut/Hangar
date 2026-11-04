import type { AddressStatus, AddressView } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { getProject, listProjects, type Project } from '../projects/repo.ts'
import { checkAddress, CHECK_TIMEOUT } from '../settings/reachability.ts'
import { type AddressCheck, deleteOtherChecks, listChecks, saveCheck } from './repo.ts'

// What the Control Tower shows beside each public address comes from here, and always from a real
// request: core asks for the address over the internet, through Cloudflare and the tunnel, and
// stores what happened. Nothing is assumed from timers or from the deploy having succeeded.

interface Result {
  status: AddressStatus
  message: string
}

/** Proxy and Cloudflare answers for "the app behind this address did not respond". */
const APP_DOWN_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530])

/** Whether the app itself answers at the address. A 4xx or 500 is still the app answering. */
async function askApp(hostname: string): Promise<Result> {
  const notAnswering = (detail: string): Result => ({
    status: 'app_down',
    message: `${hostname} reaches this Hangar, but the app ${detail}. Check the Radio tab for its output.`,
  })
  try {
    const response = await fetch(`https://${hostname}/`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(CHECK_TIMEOUT),
    })
    await response.body?.cancel()
    if (APP_DOWN_STATUSES.has(response.status)) {
      return notAnswering(`did not answer (HTTP ${response.status})`)
    }
    return {
      status: 'live',
      message: `Reached over the internet: the app answered with HTTP ${response.status}.`,
    }
  } catch {
    return notAnswering('did not answer in time')
  }
}

async function probe(ctx: Ctx, project: Project, hostname: string): Promise<Result> {
  if (!project.currentDeploymentId) {
    return {
      status: 'not_running',
      message: 'Nothing is deployed yet, so there is no app to reach.',
    }
  }
  if (project.desiredState === 'stopped') {
    return { status: 'not_running', message: 'This app is stopped. Start it to bring it back.' }
  }
  try {
    const { status, message } = await checkAddress(ctx, { hostname })
    return status === 'ok' ? await askApp(hostname) : { status, message }
  } catch (error) {
    // The address no longer fits the server's domains, for example.
    if (!(error instanceof UserError)) throw error
    return { status: 'unreachable', message: error.message }
  }
}

/** Checks every public address of one project, or of all projects, and announces the results. */
export async function refreshAddresses(ctx: Ctx, projectId?: string): Promise<void> {
  const project = projectId ? await getProject(ctx.db, projectId) : null
  const projects = projectId ? (project ? [project] : []) : await listProjects(ctx.db)
  for (const current of projects) {
    if (current.hostnames.length === 0) continue
    await Promise.all(
      current.hostnames.map(async (hostname) => {
        const result = await probe(ctx, current, hostname)
        await saveCheck(ctx.db, { hostname, projectId: current.id, ...result })
      }),
    )
    await ctx.events.publish('address_status', { projectId: current.id })
  }
}

export const listAddressChecks = (ctx: Ctx, projectIds: string[]) => listChecks(ctx.db, projectIds)

export const pruneAddressChecks = (ctx: Ctx, projectId: string, keep: string[]) =>
  deleteOtherChecks(ctx.db, projectId, keep)

/** One entry per address, in the project's order. An address not checked yet says so. */
export function addressViews(hostnames: string[], checks: AddressCheck[]): AddressView[] {
  return hostnames.map((hostname) => {
    const check = checks.find((c) => c.hostname === hostname)
    return {
      hostname,
      url: `https://${hostname}`,
      status: check?.status ?? 'checking',
      message: check?.message ?? null,
      checkedAt: check?.checkedAt.toISOString() ?? null,
      lastLiveAt: check?.lastLiveAt?.toISOString() ?? null,
    }
  })
}

export async function addressEvent(ctx: Ctx, projectId: string) {
  const project = await getProject(ctx.db, projectId)
  return {
    projectId,
    addresses: addressViews(project?.hostnames ?? [], await listChecks(ctx.db, [projectId])),
  }
}
