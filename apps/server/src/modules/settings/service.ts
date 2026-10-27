import {
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
    publicDomain: s.publicDomain,
    exposeTowerPublicly: s.exposeTowerPublicly,
    githubConnected: s.githubToken !== null,
    tunnelConfigured: s.cloudflareTunnelToken !== null,
    towerUrl: s.lanDomain ? `http://${towerHostname(s.lanDomain)}` : null,
  }
}

/** Changing an address re-renders every route. */
export async function updateSettings(
  ctx: Ctx,
  patch: { lanIp?: string; publicDomain?: string | null; exposeTowerPublicly?: boolean },
): Promise<void> {
  const next: Partial<Settings> = {}
  if (patch.lanIp !== undefined) {
    next.lanIp = patch.lanIp
    next.lanDomain = sslipDomain(patch.lanIp)
  }
  if (patch.publicDomain !== undefined) {
    if (patch.publicDomain !== null && !isValidDomain(patch.publicDomain)) {
      throw new UserError(
        400,
        'invalid_domain',
        'Enter a domain like example.com, without https://.',
      )
    }
    next.publicDomain = patch.publicDomain
    if (patch.publicDomain === null) next.exposeTowerPublicly = false
  }
  if (patch.exposeTowerPublicly !== undefined) {
    const publicDomain =
      next.publicDomain !== undefined ? next.publicDomain : (await getSettings(ctx.db)).publicDomain
    if (patch.exposeTowerPublicly && !publicDomain) {
      throw new UserError(
        400,
        'no_public_domain',
        'Set a public domain before exposing the Control Tower.',
      )
    }
    next.exposeTowerPublicly = patch.exposeTowerPublicly
  }
  await setSettings(ctx.db, next)
  await syncRouting(ctx)
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
