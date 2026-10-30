import { defaultDomain, hooksHostname, towerHostname } from '@hangar/shared'
import type { Ctx } from '../context.ts'
import { getSettings } from '../modules/settings/repo.ts'
import { ADDRESS_CHECK_PATH, ENTRYPOINT_HEADER } from '../platform/proxy.ts'

/**
 * Which hostnames and browser origins may use the API. The API answers only on the Control
 * Tower's own hostnames, so a page on any other name (an app, or a DNS-rebinding attacker) cannot
 * reach it through the visitor's browser.
 */
export interface AccessPolicy {
  /** Hostnames (with port, if any) that serve the Control Tower on the LAN. */
  towerHosts: Set<string>
  /** `tower.<default domain>` when the Control Tower is exposed publicly. */
  publicTowerHost: string | null
  /** `hooks.<default domain>`, which only serves webhooks. */
  hooksHost: string | null
  /** Origins allowed to send state-changing requests. */
  origins: Set<string>
}

const CACHE_MS = 5_000

export function createAccessPolicy(ctx: Ctx) {
  let cached: { policy: AccessPolicy; at: number } | null = null

  async function load(): Promise<AccessPolicy> {
    const settings = await getSettings(ctx.db)
    const towerHosts = new Set<string>()
    const origins = new Set<string>()
    if (settings.lanDomain) {
      towerHosts.add(towerHostname(settings.lanDomain))
      origins.add(`http://${towerHostname(settings.lanDomain)}`)
    }
    if (settings.lanIp) {
      towerHosts.add(settings.lanIp)
      origins.add(`http://${settings.lanIp}`)
    }
    for (const origin of ctx.config.devOrigins) {
      origins.add(origin)
      towerHosts.add(new URL(origin).host)
    }
    const domain = defaultDomain(settings)
    const publicTowerHost = domain && settings.exposeTowerPublicly ? towerHostname(domain) : null
    if (publicTowerHost) origins.add(`https://${publicTowerHost}`)
    const hooksHost = domain ? hooksHostname(domain) : null
    return { towerHosts, publicTowerHost, hooksHost, origins }
  }

  return {
    async get(): Promise<AccessPolicy> {
      if (!cached || Date.now() - cached.at > CACHE_MS)
        cached = { policy: await load(), at: Date.now() }
      return cached.policy
    },
    /** Call after changing settings that affect hostnames. */
    invalidate() {
      cached = null
    },
  }
}

export type AccessPolicyCache = ReturnType<typeof createAccessPolicy>

export type RequestArea =
  'api' | 'webhook' | 'health' | 'address-check' | 'not-found' | 'app-not-running'

/** Strips the default port so `tower.x:80` and `tower.x` compare equal. */
export function normalizeHost(host: string | undefined): string {
  return (host ?? '').toLowerCase().replace(/:80$/, '')
}

/**
 * Decides what a request may reach, from its hostname and the entrypoint Traefik stamped on it.
 * Requests without the entrypoint header came straight to core (development, or the container's
 * own health check) and are treated as LAN traffic.
 */
export function classifyRequest(
  policy: AccessPolicy,
  request: { host: string | undefined; path: string; headers: Record<string, unknown> },
): RequestArea {
  const host = normalizeHost(request.host)
  const isPublic = request.headers[ENTRYPOINT_HEADER.toLowerCase()] === 'public'
  const path = request.path.split('?')[0]!

  if (path === '/api/health') return 'health'
  if (path.startsWith('/api/webhooks/')) return 'webhook'
  if (isPublic && path.startsWith(ADDRESS_CHECK_PATH)) return 'address-check'
  if (isPublic) {
    // The public entrypoint reaches core only for webhooks and an explicitly exposed tower.
    return policy.publicTowerHost && host === policy.publicTowerHost ? 'api' : 'not-found'
  }
  if (policy.towerHosts.has(host)) return 'api'
  if (policy.hooksHost && host === policy.hooksHost) return 'not-found'
  return 'app-not-running'
}
