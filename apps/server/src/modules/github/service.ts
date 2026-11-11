// Sign in with GitHub (decision D37). One GitHub App per Hangar, created from Settings through
// GitHub's manifest flow. People authorize it to sign in, and the user token it gives them is
// also their GitHub connection, limited to the repositories they shared with the app.
import { createHash, randomBytes } from 'node:crypto'
import { defaultDomain, type GithubPurpose, USERNAME_PATTERN } from '@hangar/shared'
import { eq } from 'drizzle-orm'
import type { Ctx } from '../../context.ts'
import { users } from '../../db/schema.ts'
import { UserError } from '../../errors.ts'
import { GithubError } from '../../platform/github.ts'
import type { User } from '../auth/repo.ts'
import { createSession, type SessionUser, sessionUser } from '../auth/service.ts'
import { getSettings, setSettings } from '../settings/repo.ts'
import {
  clearGithubToken,
  GITHUB_APP_SECRET_AAD,
  getGithubApp,
  getGithubToken,
  storeAppTokens,
} from '../settings/secrets.ts'
import { findLink, getUser, takeLink } from '../users/repo.ts'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const newState = () => randomBytes(24).toString('base64url')

/** The dashboard page GitHub sends people back to after they authorize the app. */
export const CALLBACK_PATH = '/auth/github'
const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
/** GitHub accepts at most this many callback URLs per app. */
const MAX_CALLBACK_URLS = 10

// Flows in progress, in memory: a restart only means pressing the button again. The state is
// also kept in a cookie, so a code can only be finished in the browser that started it.
const FLOW_TTL_MS = 10 * 60_000
const MANIFEST_TTL_MS = 60 * 60_000 // GitHub's manifest codes last an hour
const MAX_FLOWS = 1_000

interface Flow {
  purpose: GithubPurpose
  redirectUri: string
  expires: number
  /** `link`: the account that asked. */
  userId?: string
  /** `invite`: the hash of the invite's token, and an optional chosen username. */
  inviteHash?: string
  username?: string
}

const flows = new Map<string, Flow>()
const manifests = new Map<string, { userId: string; expires: number }>()

function remember<T extends { expires: number }>(map: Map<string, T>, key: string, value: T) {
  const now = Date.now()
  for (const [k, v] of map) if (v.expires < now) map.delete(k)
  if (map.size >= MAX_FLOWS) map.delete(map.keys().next().value!)
  map.set(key, value)
}

function take<T extends { expires: number }>(map: Map<string, T>, key: string): T | null {
  const value = map.get(key)
  map.delete(key)
  return value && value.expires > Date.now() ? value : null
}

const notSetUp = () =>
  new UserError(
    409,
    'github_sign_in_off',
    'Sign in with GitHub is not set up on this Hangar.',
    'An admin can set it up under Settings.',
  )

const badInvite = () =>
  new UserError(
    400,
    'invalid_link',
    'This link has expired or was already used.',
    'Ask your admin for a new one.',
  )

function githubTrouble(error: unknown): never {
  if (error instanceof GithubError && error.status < 500) {
    throw new UserError(
      400,
      'github_refused',
      'GitHub did not accept the sign-in.',
      'Start again. Codes from GitHub work once and only for a few minutes.',
    )
  }
  throw new UserError(
    502,
    'github_unreachable',
    "Hangar could not reach GitHub. Check the server's internet connection.",
  )
}

/** Sets the GitHub account a user signs in with. Different accounts never share one. */
async function linkIdentity(ctx: Ctx, userId: string, github: { id: number; login: string }) {
  await ctx.db
    .update(users)
    .set({ githubUserId: github.id, githubLogin: github.login })
    .where(eq(users.id, userId))
}

async function userByGithubId(ctx: Ctx, githubId: number): Promise<User | null> {
  const [row] = await ctx.db.select().from(users).where(eq(users.githubUserId, githubId))
  return row ?? null
}

const inUse = (login: string) =>
  new UserError(
    409,
    'github_in_use',
    `The GitHub account ${login} is already connected to another Hangar account.`,
    'Disconnect it there first, or sign in with GitHub to use that account.',
  )

// Starting and finishing

/** Where to send the browser to authorize the app, and the state to keep in a cookie. */
export async function startGithubFlow(
  ctx: Ctx,
  input: { purpose: GithubPurpose; token?: string; username?: string },
  origin: string,
  userId: string | null,
): Promise<{ state: string; url: string }> {
  const app = await getGithubApp(ctx)
  if (!app) throw notSetUp()
  const flow: Flow = {
    purpose: input.purpose,
    redirectUri: `${origin}${CALLBACK_PATH}`,
    expires: Date.now() + FLOW_TTL_MS,
  }
  if (input.purpose === 'link') {
    if (!userId) throw new UserError(401, 'unauthenticated', 'Sign in to continue.')
    flow.userId = userId
  }
  if (input.purpose === 'invite') {
    const found = input.token ? await findLink(ctx.db, sha256(input.token)) : null
    if (found?.link.kind !== 'invite') throw badInvite()
    flow.inviteHash = found.link.tokenHash
    flow.username = input.username
  }
  const state = newState()
  remember(flows, state, flow)
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('redirect_uri', flow.redirectUri)
  url.searchParams.set('state', state)
  return { state, url: url.toString() }
}

/** What finishing needs from the request: the cookie, and the session for `link`. */
export interface FinishContext {
  cookieState: string | undefined
  /** Throws when nobody is signed in. Only called for `link`. */
  currentUserId: () => Promise<string>
}

export async function finishGithubFlow(
  ctx: Ctx,
  input: { code: string; state: string },
  request: FinishContext,
) {
  const flow = take(flows, input.state)
  if (!flow || request.cookieState !== input.state) {
    throw new UserError(
      400,
      'github_flow_expired',
      'This sign-in with GitHub ran out of time or was started in another browser.',
      'Start again from this browser.',
    )
  }
  const app = await getGithubApp(ctx)
  if (!app) throw notSetUp()
  const tokens = await ctx.github
    .exchangeCode(app, input.code, flow.redirectUri)
    .catch(githubTrouble)
  const github = await ctx.github.currentUser(tokens.accessToken).catch(githubTrouble)

  let session: Awaited<ReturnType<typeof createSession>> & { user: SessionUser }
  let userId: string
  if (flow.purpose === 'link') {
    userId = await request.currentUserId()
    if (userId !== flow.userId) {
      throw new UserError(403, 'github_flow_expired', 'This was started by another account.')
    }
    const other = await userByGithubId(ctx, github.id)
    if (other && other.id !== userId) throw inUse(github.login)
    await linkIdentity(ctx, userId, github)
    await storeAppTokens(ctx, userId, tokens)
    return {
      purpose: flow.purpose,
      session: null,
      ...(await installState(ctx, tokens.accessToken)),
    }
  }
  if (flow.purpose === 'login') {
    const user =
      (await userByGithubId(ctx, github.id)) ??
      ((await getSettings(ctx.db)).openSignUp ? await createSignedUpUser(ctx, github) : null)
    if (!user) {
      throw new UserError(
        403,
        'github_not_linked',
        `No Hangar account uses the GitHub account ${github.login}.`,
        'Sign in with your password and connect GitHub under Account, or ask your admin for an invite.',
      )
    }
    userId = user.id
    await linkIdentity(ctx, userId, github) // their GitHub name may have changed
    session = {
      user: sessionUser(user),
      ...(await createSession(ctx, user.id)),
    }
    // Signing in keeps a token they pasted by hand: it may reach repositories the app was not
    // given yet. Connect with GitHub, under Account, is how they switch.
    const current = await getGithubToken(ctx, userId)
    if (current && !current.startsWith('ghu_')) {
      return { purpose: flow.purpose, session, needsInstall: false, installUrl: null }
    }
  } else {
    const user = await createInvitedUser(ctx, flow, github)
    userId = user.id
    session = { user: sessionUser(user), ...(await createSession(ctx, user.id)) }
  }
  await storeAppTokens(ctx, userId, tokens)
  return { purpose: flow.purpose, session, ...(await installState(ctx, tokens.accessToken)) }
}

/** People who have not shared any repository with the app yet are sent to do that next. */
async function installState(ctx: Ctx, token: string) {
  const app = await getGithubApp(ctx)
  const count = await ctx.github.countInstallations(token).catch(() => 1)
  return {
    needsInstall: count === 0,
    installUrl: app ? installUrl(app.htmlUrl) : null,
  }
}

const installUrl = (htmlUrl: string) => `${htmlUrl}/installations/new`

/**
 * Accepting an invite with GitHub: the invite is used up only once GitHub has said who they are,
 * in the same transaction that creates the account, so any failure leaves it usable.
 */
async function createInvitedUser(ctx: Ctx, flow: Flow, github: { id: number; login: string }) {
  const username = flow.username ?? github.login.toLowerCase()
  if (!USERNAME_PATTERN.test(username)) {
    throw new UserError(
      400,
      'choose_username',
      `Your GitHub name, ${github.login}, does not fit Hangar's username rules.`,
      'Type a username on the invite page, then continue with GitHub again.',
    )
  }
  if (await userByGithubId(ctx, github.id)) throw inUse(github.login)
  try {
    return await ctx.db.transaction(async (tx) => {
      const db = tx as unknown as Ctx['db']
      const link = await takeLink(db, flow.inviteHash!)
      if (link?.kind !== 'invite') throw badInvite()
      const maker = await getUser(db, link.createdBy)
      if (maker?.role !== 'admin') throw badInvite()
      const [created] = await tx
        .insert(users)
        .values({
          username,
          passwordHash: null,
          role: link.role,
          githubUserId: github.id,
          githubLogin: github.login,
        })
        .returning()
      return created!
    })
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause
    if (cause?.code === '23505') {
      if (cause.constraint?.includes('github')) throw inUse(github.login)
      throw new UserError(
        409,
        'username_taken',
        `The username ${username} is taken.`,
        'Type another username on the invite page, then continue with GitHub again.',
      )
    }
    throw error
  }
}

/**
 * Open sign-up (D38): anyone with a GitHub account gets one here. It deploys only to servers of
 * its own, never to this machine. Its username is its GitHub name, made unique if needed.
 */
async function createSignedUpUser(ctx: Ctx, github: { id: number; login: string }) {
  const base = github.login.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
  const stem = (/^[a-z0-9]/.test(base) ? base : `gh-${base}`).padEnd(3, '0').slice(0, 28)
  for (let attempt = 0; attempt < 20; attempt++) {
    const username = attempt === 0 ? stem : `${stem}-${randomBytes(2).toString('hex')}`
    if (!USERNAME_PATTERN.test(username)) continue
    try {
      const [created] = await ctx.db
        .insert(users)
        .values({
          username,
          passwordHash: null,
          role: 'member',
          localAccess: false,
          githubUserId: github.id,
          githubLogin: github.login,
        })
        .returning()
      ctx.log.info({ username }, 'Someone signed up with GitHub')
      return created!
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause
      if (cause?.code !== '23505') throw error
      if (cause.constraint?.includes('github')) return userByGithubId(ctx, github.id)
    }
  }
  throw new UserError(409, 'username_taken', 'Hangar could not find a free username. Try again.')
}

// The signed-in person's account

export async function accountView(ctx: Ctx, userId: string) {
  const user = await getUser(ctx.db, userId)
  if (!user) throw new UserError(401, 'unauthenticated', 'Sign in to continue.')
  const token = await getGithubToken(ctx, userId)
  return {
    hasPassword: user.passwordHash !== null,
    githubApp: await githubAppView(ctx),
    github: {
      connected: token !== null,
      kind:
        token === null ? null : token.startsWith('ghu_') ? ('app' as const) : ('token' as const),
      login: user.githubLogin,
    },
  }
}

/** Disconnecting also stops GitHub sign-in, so it needs another way in: a password. */
export async function disconnectGithub(ctx: Ctx, userId: string) {
  const user = await getUser(ctx.db, userId)
  if (user?.githubUserId && user.passwordHash === null) {
    throw new UserError(
      409,
      'needs_password',
      'Set a password first, so you can still sign in without GitHub.',
    )
  }
  await clearGithubToken(ctx, userId)
  await ctx.db
    .update(users)
    .set({ githubUserId: null, githubLogin: null })
    .where(eq(users.id, userId))
}

// Creating the app (admins)

/**
 * The manifest GitHub needs to create the app. Every Control Tower address becomes a callback, so
 * sign-in works on each; addresses added later must be added on GitHub by hand.
 */
export async function githubAppManifest(
  ctx: Ctx,
  adminId: string,
  origin: string,
  towerOrigins: Iterable<string>,
) {
  const settings = await getSettings(ctx.db)
  const state = newState()
  remember(manifests, state, { userId: adminId, expires: Date.now() + MANIFEST_TTL_MS })
  const origins = [origin, ...[...towerOrigins].filter((o) => o !== origin)]
  const where = defaultDomain(settings) ?? settings.lanIp ?? ''
  const manifest = {
    // GitHub App names are unique across GitHub and at most 34 characters.
    name: `Hangar ${where}`.trim().slice(0, 34),
    url: origin,
    description: 'Sign in to a Hangar server and deploy from your repositories.',
    // Public, so invited people can share their own repositories with it. That alone gives
    // nobody an account here: sign-in still needs an account or an invite.
    public: true,
    redirect_url: `${origin}/people/github-app`,
    callback_urls: origins.slice(0, MAX_CALLBACK_URLS).map((o) => `${o}${CALLBACK_PATH}`),
    setup_url: `${origin}/account?github=installed`,
    setup_on_update: true,
    request_oauth_on_install: false,
    // Hangar makes its own webhook per project; the app's is not used.
    hook_attributes: { url: `${origin}/api/webhooks/github-app`, active: false },
    default_permissions: { contents: 'read', metadata: 'read', repository_hooks: 'write' },
    default_events: [],
  }
  return {
    action: `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`,
    manifest: JSON.stringify(manifest),
  }
}

/** GitHub created the app: keep its client id and secret. Its private key is not needed. */
export async function completeGithubApp(
  ctx: Ctx,
  adminId: string,
  input: { code: string; state: string },
) {
  const started = take(manifests, input.state)
  if (started?.userId !== adminId) {
    throw new UserError(
      400,
      'github_flow_expired',
      'This setup ran out of time or was started by another account.',
      'Press "Set up on GitHub" again.',
    )
  }
  const app = await ctx.github.createAppFromManifest(input.code).catch(githubTrouble)
  await setSettings(ctx.db, {
    githubApp: {
      id: app.id,
      slug: app.slug,
      clientId: app.clientId,
      clientSecret: ctx.crypto.seal(app.clientSecret, GITHUB_APP_SECRET_AAD),
      owner: app.owner,
      htmlUrl: app.htmlUrl,
    },
  })
  ctx.log.info({ app: app.slug }, 'Created the GitHub App for sign-in')
}

/** Stops GitHub sign-in here. The app itself stays on GitHub until its owner deletes it. */
export async function removeGithubApp(ctx: Ctx) {
  await setSettings(ctx.db, { githubApp: null, openSignUp: false })
}

export async function accessView(ctx: Ctx) {
  return {
    githubApp: await githubAppView(ctx),
    openSignUp: (await getSettings(ctx.db)).openSignUp,
  }
}

/** Open sign-up needs GitHub sign-in: GitHub is the only way such an account gets in. */
export async function updateAccess(ctx: Ctx, patch: { openSignUp: boolean }) {
  if (patch.openSignUp && !(await getSettings(ctx.db)).githubApp) {
    throw new UserError(400, 'github_sign_in_off', 'Set up Sign in with GitHub first.')
  }
  await setSettings(ctx.db, { openSignUp: patch.openSignUp })
  return accessView(ctx)
}

/** What every signed-in page may know about the app. */
export async function githubAppView(ctx: Ctx) {
  const { githubApp } = await getSettings(ctx.db)
  if (!githubApp) return null
  return {
    slug: githubApp.slug,
    owner: githubApp.owner,
    settingsUrl: `https://github.com/settings/apps/${githubApp.slug}`,
    installUrl: installUrl(githubApp.htmlUrl),
  }
}
