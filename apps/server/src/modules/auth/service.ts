import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { UserRole } from '@hangar/shared'
import { hash, verify } from '@node-rs/argon2'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { setSettings } from '../settings/repo.ts'
import {
  deleteSession,
  deleteSessions,
  getActiveSession,
  getDashboardLayout,
  getUserById,
  getUserByUsername,
  hasUsers,
  insertFirstUser,
  insertSession,
  setDashboardLayout,
  touchSession,
  updatePassword,
  upgradePasswordHash,
} from './repo.ts'

const SESSION_TTL_MS = 30 * 24 * 60 * 60_000
/** Sliding expiry is refreshed at most this often, to avoid a write on every request. */
const SESSION_REFRESH_MS = 60 * 60_000
/** However active a session stays, it ends this long after sign-in. */
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60_000

// Crockford base32: no I, L, O, U, so the boarding pass is easy to read and type.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_CHARS = 28 // 140 bits
const CODE_GROUP = 4

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export interface AuthenticatedSession {
  sessionId: string
  user: { id: string; username: string; role: UserRole }
  expiresAt: Date
  /** True when the expiry moved, so the cookie should be re-sent. */
  refreshed: boolean
}

export class AuthError extends UserError {}

// Password hashing

// OWASP's recommended argon2id parameters, spelled out so a library update cannot change them.
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }
const CURRENT_HASH = `$m=${ARGON2.memoryCost},t=${ARGON2.timeCost},p=${ARGON2.parallelism}$`

export const hashPassword = (password: string) => hash(password, ARGON2)

// A valid hash of a random password, verified when the username does not exist so a login attempt
// takes the same time either way.
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')))

// Failed logins per username, so a password cannot be guessed by spreading attempts over many IPs.
// In memory: it resets on restart, which is acceptable for a single-process MVP.
const LOCKOUT_ATTEMPTS = 10
const LOCKOUT_WINDOW_MS = 15 * 60_000
const LOCKOUT_MAX_TRACKED = 10_000
const failures = new Map<string, { count: number; since: number }>()

function checkLockout(username: string): void {
  const entry = failures.get(username)
  if (!entry) return
  if (Date.now() - entry.since > LOCKOUT_WINDOW_MS) failures.delete(username)
  else if (entry.count >= LOCKOUT_ATTEMPTS) {
    throw new AuthError(
      429,
      'too_many_attempts',
      'Too many failed sign-in attempts for this account. Wait 15 minutes and try again.',
    )
  }
}

function recordFailure(username: string): void {
  const entry = failures.get(username)
  // Made-up usernames must not grow this without limit; the oldest entry goes first.
  if (failures.size >= LOCKOUT_MAX_TRACKED && !entry) failures.delete(failures.keys().next().value!)
  if (entry && Date.now() - entry.since <= LOCKOUT_WINDOW_MS) entry.count++
  else failures.set(username, { count: 1, since: Date.now() })
}

// Sessions

/** The cookie holds the random token; the database stores only its hash. */
export async function createSession(ctx: Ctx, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const sessionId = sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await insertSession(ctx.db, { id: sessionId, userId, expiresAt })
  return { token, sessionId, expiresAt }
}

export async function resolveSession(
  ctx: Ctx,
  token: string,
): Promise<AuthenticatedSession | null> {
  const sessionId = sha256(token)
  const row = await getActiveSession(ctx.db, sessionId)
  if (!row) return null
  let expiresAt = row.session.expiresAt
  const refreshed = Date.now() - row.session.lastSeenAt.getTime() > SESSION_REFRESH_MS
  if (refreshed) {
    const limit = row.session.createdAt.getTime() + SESSION_MAX_AGE_MS
    expiresAt = new Date(Math.min(Date.now() + SESSION_TTL_MS, limit))
    await touchSession(ctx.db, sessionId, expiresAt)
  }
  return { sessionId, user: row.user, expiresAt, refreshed }
}

/** For long-lived streams: is this session still valid, with the same role as when it opened? */
export async function isSessionCurrent(ctx: Ctx, session: AuthenticatedSession): Promise<boolean> {
  const row = await getActiveSession(ctx.db, session.sessionId)
  return row?.user.role === session.user.role
}

export async function endSession(ctx: Ctx, sessionId: string): Promise<void> {
  await deleteSession(ctx.db, sessionId)
}

/** The CSRF token is derived from the session, so nothing extra is stored. */
export function csrfTokenFor(ctx: Ctx, sessionId: string): string {
  return createHmac('sha256', ctx.config.sessionSecret)
    .update(`csrf:${sessionId}`)
    .digest('base64url')
}

export function isValidCsrfToken(ctx: Ctx, sessionId: string, token: string | undefined): boolean {
  if (!token) return false
  const expected = Buffer.from(csrfTokenFor(ctx, sessionId))
  const given = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// Sign-in

export async function login(ctx: Ctx, username: string, password: string) {
  const name = username.trim().toLowerCase()
  checkLockout(name)
  const user = await getUserByUsername(ctx.db, name)
  const valid = await verify(user?.passwordHash ?? (await getDummyHash()), password).catch(
    () => false,
  )
  if (!user || !valid) {
    recordFailure(name)
    throw new AuthError(401, 'invalid_credentials', 'The username or password is not correct.')
  }
  failures.delete(name)
  if (!user.passwordHash!.includes(CURRENT_HASH)) {
    await upgradePasswordHash(ctx.db, user.id, await hashPassword(password))
  }
  return {
    user: { id: user.id, username: user.username, role: user.role },
    ...(await createSession(ctx, user.id)),
  }
}

/** Needs the current password. Ends every session, and starts a new one for this browser. */
export async function changePassword(
  ctx: Ctx,
  userId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await getUserById(ctx.db, userId)
  if (!user) throw new AuthError(401, 'unauthenticated', 'Sign in to continue.')
  if (user.passwordHash === null) {
    throw new AuthError(409, 'no_password', 'This account has no password yet. Set one instead.')
  }
  checkLockout(user.username)
  if (!(await verify(user.passwordHash, input.currentPassword).catch(() => false))) {
    recordFailure(user.username)
    throw new AuthError(400, 'wrong_password', 'That is not your current password.')
  }
  failures.delete(user.username)
  await updatePassword(ctx.db, user.id, await hashPassword(input.newPassword))
  return {
    user: { id: user.id, username: user.username, role: user.role },
    ...(await createSession(ctx, user.id)),
  }
}

/**
 * For an account made with GitHub: its first password, so it can also sign in without GitHub.
 * Like a change, it ends every other session.
 */
export async function setFirstPassword(ctx: Ctx, userId: string, password: string) {
  const user = await getUserById(ctx.db, userId)
  if (!user) throw new AuthError(401, 'unauthenticated', 'Sign in to continue.')
  if (user.passwordHash !== null) {
    throw new AuthError(
      409,
      'has_password',
      'This account already has a password. Change it instead.',
    )
  }
  await updatePassword(ctx.db, user.id, await hashPassword(password))
  return {
    user: { id: user.id, username: user.username, role: user.role },
    ...(await createSession(ctx, user.id)),
  }
}

export const signOutEverywhere = (ctx: Ctx, userId: string) => deleteSessions(ctx.db, userId)

// First-run setup (the boarding pass)

export function normalizeSetupCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export async function needsSetup(ctx: Ctx): Promise<boolean> {
  return !(await hasUsers(ctx.db))
}

/**
 * Issues a fresh one-time setup code and stores only its hash. Returns null once an account
 * exists. The plaintext is shown once by `hangar-admin` and never written to disk.
 */
export async function issueSetupCode(ctx: Ctx): Promise<string | null> {
  if (await hasUsers(ctx.db)) return null
  const bytes = randomBytes(CODE_CHARS)
  const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
  await setSettings(ctx.db, { setupCodeHash: sha256(chars) })
  return chars.match(new RegExp(`.{1,${CODE_GROUP}}`, 'g'))!.join('-')
}

export async function completeSetup(
  ctx: Ctx,
  input: { setupCode: string; username: string; password: string },
) {
  const user = await insertFirstUser(ctx.db, {
    username: input.username,
    passwordHash: await hashPassword(input.password),
    setupCodeHash: sha256(normalizeSetupCode(input.setupCode)),
  })
  if (!user) {
    if (await hasUsers(ctx.db)) {
      throw new AuthError(
        409,
        'already_set_up',
        'This Hangar already has an account. Sign in instead.',
      )
    }
    throw new AuthError(
      400,
      'invalid_setup_code',
      'That setup code is not correct.',
      'Check the code printed by the installer. To get a new one, run: sudo hangar-admin issue-setup-code',
    )
  }
  return {
    user: { id: user.id, username: user.username, role: user.role },
    ...(await createSession(ctx, user.id)),
  }
}

/** Recovery from the command line. Signs out every session of that account. */
export async function resetPassword(ctx: Ctx, username: string, password: string) {
  const user = await getUserByUsername(ctx.db, username.trim().toLowerCase())
  if (!user) throw new AuthError(404, 'not_found', `No account named "${username}"`)
  await updatePassword(ctx.db, user.id, await hashPassword(password))
}

/** The signed-in user's home screen layout, or null for the default. */
export async function dashboardLayout(ctx: Ctx, userId: string) {
  return { layout: await getDashboardLayout(ctx.db, userId) }
}

export async function saveDashboardLayout(ctx: Ctx, userId: string, layout: unknown[]) {
  await setDashboardLayout(ctx.db, userId, layout)
}
