import { eq } from 'drizzle-orm'
import type { Ctx } from '../../context.ts'
import { users } from '../../db/schema.ts'
import {
  type GithubAppCredentials,
  GithubError,
  type GithubUserTokens,
} from '../../platform/github.ts'
import { getSettings } from './repo.ts'

// Encrypted settings, decrypted on demand. The AAD ties each value to its setting.
export const GITHUB_TOKEN_AAD = 'setting:githubToken'
export const TUNNEL_TOKEN_AAD = 'setting:cloudflareTunnelToken'
export const GITHUB_APP_SECRET_AAD = 'setting:githubApp'

/** Each account's GitHub token is tied to that account, so a sealed value cannot be moved. */
export const userGithubAad = (userId: string) => `user:${userId}:githubToken`
const userRefreshAad = (userId: string) => `user:${userId}:githubRefreshToken`

/** Renew a GitHub App token this long before it runs out, so a clone never starts with one. */
const RENEW_BEFORE_MS = 10 * 60_000

/** The GitHub App's credentials, or null until an admin has created it. */
export async function getGithubApp(ctx: Ctx) {
  const { githubApp } = await getSettings(ctx.db)
  if (!githubApp) return null
  return {
    ...githubApp,
    clientSecret: ctx.crypto.open(githubApp.clientSecret, GITHUB_APP_SECRET_AAD),
  } satisfies GithubAppCredentials & Record<string, unknown>
}

/** Stores a token from the GitHub App, replacing any token pasted by hand. */
export async function storeAppTokens(ctx: Ctx, userId: string, tokens: GithubUserTokens) {
  await ctx.db
    .update(users)
    .set({
      githubToken: ctx.crypto.seal(tokens.accessToken, userGithubAad(userId)),
      githubTokenExpiresAt: tokens.expiresAt,
      githubRefreshToken: tokens.refreshToken
        ? ctx.crypto.seal(tokens.refreshToken, userRefreshAad(userId))
        : null,
    })
    .where(eq(users.id, userId))
}

/** Forgets a user's token (the GitHub account they sign in with stays). */
export async function clearGithubToken(ctx: Ctx, userId: string) {
  await ctx.db
    .update(users)
    .set({ githubToken: null, githubTokenExpiresAt: null, githubRefreshToken: null })
    .where(eq(users.id, userId))
}

// One renewal per account at a time: a refresh token works once, so two at once would lose one.
const renewing = new Map<string, Promise<string | null>>()

/**
 * A user's own GitHub token, or null when they have not connected one. Git work for a project
 * always uses its owner's token, so one account can never reach another's private repositories.
 * A GitHub App token close to running out is renewed first.
 */
export async function getGithubToken(ctx: Ctx, userId: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({
      token: users.githubToken,
      expiresAt: users.githubTokenExpiresAt,
      refresh: users.githubRefreshToken,
    })
    .from(users)
    .where(eq(users.id, userId))
  if (!row?.token) return null
  const token = ctx.crypto.open(row.token, userGithubAad(userId))
  if (!row.expiresAt || row.expiresAt.getTime() - Date.now() > RENEW_BEFORE_MS) return token
  const stillValid = row.expiresAt.getTime() > Date.now() ? token : null
  if (!row.refresh) return stillValid

  const pending = renewing.get(userId)
  if (pending) return pending
  const refresh = ctx.crypto.open(row.refresh, userRefreshAad(userId))
  const work = renewToken(ctx, userId, refresh, stillValid).finally(() => renewing.delete(userId))
  renewing.set(userId, work)
  return work
}

async function renewToken(
  ctx: Ctx,
  userId: string,
  refresh: string,
  fallback: string | null,
): Promise<string | null> {
  const app = await getGithubApp(ctx)
  if (!app) return fallback
  try {
    const tokens = await ctx.github.refreshToken(app, refresh)
    await storeAppTokens(ctx, userId, tokens)
    return tokens.accessToken
  } catch (error) {
    if (error instanceof GithubError && error.status === 401) {
      // Revoked, or unused for six months: they connect again from Account.
      ctx.log.info({ userId }, 'GitHub refused to renew a token; it was removed')
      await clearGithubToken(ctx, userId)
      return null
    }
    ctx.log.warn({ err: error, userId }, 'Could not renew a GitHub token')
    return fallback
  }
}

/** The Cloudflare tunnel token, or null when public mode is off. */
export async function getTunnelToken(ctx: Ctx): Promise<string | null> {
  const { cloudflareTunnelToken } = await getSettings(ctx.db)
  return cloudflareTunnelToken ? ctx.crypto.open(cloudflareTunnelToken, TUNNEL_TOKEN_AAD) : null
}
