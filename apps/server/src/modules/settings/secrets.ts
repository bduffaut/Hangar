import type { Ctx } from '../../context.ts'
import { getSettings } from './repo.ts'

// Encrypted settings, decrypted on demand. The AAD ties each value to its setting.
export const GITHUB_TOKEN_AAD = 'setting:githubToken'
export const TUNNEL_TOKEN_AAD = 'setting:cloudflareTunnelToken'

/** The GitHub token for private repositories, or null when none is connected. */
export async function getGithubToken(ctx: Ctx): Promise<string | null> {
  const { githubToken } = await getSettings(ctx.db)
  return githubToken ? ctx.crypto.open(githubToken, GITHUB_TOKEN_AAD) : null
}

/** The Cloudflare tunnel token, or null when public mode is off. */
export async function getTunnelToken(ctx: Ctx): Promise<string | null> {
  const { cloudflareTunnelToken } = await getSettings(ctx.db)
  return cloudflareTunnelToken ? ctx.crypto.open(cloudflareTunnelToken, TUNNEL_TOKEN_AAD) : null
}
