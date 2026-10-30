import {
  defaultDomain,
  isValidDomain,
  type Settings,
  type SettingsView,
  sslipDomain,
  towerHostname,
} from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { GithubError } from '../../platform/github.ts'
import { ensureTunnel, syncRouting } from '../../worker/reconciler.ts'
import { listProjects } from '../projects/repo.ts'
import { getSettings, setSettings } from './repo.ts'
import { GITHUB_TOKEN_AAD, TUNNEL_TOKEN_AAD } from './secrets.ts'

/** First boot only: adopt the LAN IP the installer detected. Afterwards the database owns it. */
export async function seedSettings(ctx: Ctx): Promise<void> {
  const current = await getSettings(ctx.db)
  if (current.lanIp || !ctx.config.lanIp) return
  await setSettings(ctx.db, { lanIp: ctx.config.lanIp, lanDomain: sslipDomain(ctx.config.lanIp) })
  ctx.log.info({ lanIp: ctx.config.lanIp }, 'Seeded LAN address from installer')
}

export async function settingsView(ctx: Ctx): Promise<SettingsView> {
  const s = await getSettings(ctx.db)
  return {
    lanIp: s.lanIp,
    lanDomain: s.lanDomain,
    publicDomains: s.publicDomains,
    defaultDomain: defaultDomain(s),
    exposeTowerPublicly: s.exposeTowerPublicly,
    githubConnected: s.githubToken !== null,
    tunnelConfigured: s.cloudflareTunnelToken !== null,
    towerUrl: s.lanDomain ? `http://${towerHostname(s.lanDomain)}` : null,
  }
}

/** Changing an address re-renders every route. */
export async function updateSettings(
  ctx: Ctx,
  patch: { lanIp?: string; publicDomains?: string[]; exposeTowerPublicly?: boolean },
): Promise<void> {
  const next: Partial<Settings> = {}
  if (patch.lanIp !== undefined) {
    next.lanIp = patch.lanIp
    next.lanDomain = sslipDomain(patch.lanIp)
  }
  if (patch.publicDomains !== undefined) {
    next.publicDomains = await cleanPublicDomains(ctx, patch.publicDomains)
    if (next.publicDomains.length === 0) next.exposeTowerPublicly = false
  }
  if (patch.exposeTowerPublicly !== undefined) {
    const domains = next.publicDomains ?? (await getSettings(ctx.db)).publicDomains
    if (patch.exposeTowerPublicly && domains.length === 0) {
      throw new UserError(
        400,
        'no_public_domain',
        'Add a domain before making the Control Tower public.',
      )
    }
    next.exposeTowerPublicly = patch.exposeTowerPublicly
  }
  await setSettings(ctx.db, next)
  await syncRouting(ctx)
}

/**
 * Validates the owner's domain list: real domains, no repeats, none inside another (an address
 * must belong to exactly one), and none removed while a project still uses it.
 */
async function cleanPublicDomains(ctx: Ctx, input: string[]): Promise<string[]> {
  const domains = [
    ...new Set(input.map((d) => d.replace(/^https?:\/\//, '').replace(/[/.]+$/, ''))),
  ]
  const invalid = domains.find((d) => !isValidDomain(d))
  if (invalid !== undefined) {
    throw new UserError(
      400,
      'invalid_domain',
      `"${invalid}" is not a domain. Enter one like example.com, without https://.`,
    )
  }
  const nested = domains.find((d) =>
    domains.some((other) => d !== other && d.endsWith(`.${other}`)),
  )
  if (nested) {
    throw new UserError(
      400,
      'nested_domain',
      `${nested} is already covered by another domain in the list.`,
      'Add only the domains you own, like example.com. Choose names under them per project.',
    )
  }
  for (const project of await listProjects(ctx.db)) {
    const orphan = project.hostnames.find(
      (h) => !domains.some((d) => h === d || h.endsWith(`.${d}`)),
    )
    if (orphan) {
      throw new UserError(
        409,
        'domain_in_use',
        `${project.name} still uses ${orphan}.`,
        `Remove that address from ${project.name} first, under its Settings tab.`,
      )
    }
  }
  return domains
}

/** Verifies a GitHub token by asking GitHub who it belongs to, then stores it encrypted. */
export async function connectGithub(ctx: Ctx, token: string | null) {
  if (!token) {
    await setSettings(ctx.db, { githubToken: null })
    return { connected: false, login: null }
  }
  const user = await ctx.github.currentUser(token).catch((error: unknown) => {
    if (error instanceof GithubError && error.status === 401) {
      throw new UserError(
        400,
        'invalid_github_token',
        'GitHub did not accept that token.',
        'Check that it was copied completely and has not expired.',
      )
    }
    throw new UserError(
      502,
      'github_unreachable',
      "Hangar could not reach GitHub. Check the server's internet connection.",
    )
  })
  await setSettings(ctx.db, { githubToken: ctx.crypto.seal(token, GITHUB_TOKEN_AAD) })
  return { connected: true, login: user.login }
}

/** Stores the Cloudflare tunnel token and starts (or stops) the tunnel container. */
export async function setTunnelToken(ctx: Ctx, token: string | null): Promise<void> {
  if (token !== null && !/^[A-Za-z0-9+/=_-]{40,}$/.test(token)) {
    throw new UserError(
      400,
      'invalid_tunnel_token',
      'That does not look like a Cloudflare tunnel token.',
      'Copy the long token shown after "--token" in the Cloudflare dashboard.',
    )
  }
  await setSettings(ctx.db, {
    cloudflareTunnelToken: token ? ctx.crypto.seal(token, TUNNEL_TOKEN_AAD) : null,
  })
  await ensureTunnel(ctx)
}
