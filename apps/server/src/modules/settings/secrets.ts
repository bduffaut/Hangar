import { eq } from 'drizzle-orm'
import type { Ctx } from '../../context.ts'
import { users } from '../../db/schema.ts'
import { getSettings } from './repo.ts'

// Encrypted settings, decrypted on demand. The AAD ties each value to its setting.
export const GITHUB_TOKEN_AAD = 'setting:githubToken'
export const TUNNEL_TOKEN_AAD = 'setting:cloudflareTunnelToken'

/** Each account's GitHub token is tied to that account, so a sealed value cannot be moved. */
export const userGithubAad = (userId: string) => `user:${userId}:githubToken`

/**
 * A user's own GitHub token, or null when they have not connected one. Git work for a project
 * always uses its owner's token, so one account can never reach another's private repositories.
 */
export async function getGithubToken(ctx: Ctx, userId: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ token: users.githubToken })
    .from(users)
    .where(eq(users.id, userId))
  return row?.token ? ctx.crypto.open(row.token, userGithubAad(userId)) : null
}

/** The Cloudflare tunnel token, or null when public mode is off. */
export async function getTunnelToken(ctx: Ctx): Promise<string | null> {
  const { cloudflareTunnelToken } = await getSettings(ctx.db)
  return cloudflareTunnelToken ? ctx.crypto.open(cloudflareTunnelToken, TUNNEL_TOKEN_AAD) : null
}
