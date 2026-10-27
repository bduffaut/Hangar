import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { setSettings } from '../settings/repo.ts'
import {
  deleteSession,
  getActiveSession,
  getUserByUsername,
  hasUsers,
  insertFirstUser,
  insertSession,
  touchSession,
  updatePassword,
} from './repo.ts'

const SESSION_TTL_MS = 30 * 24 * 60 * 60_000
/** Sliding expiry is refreshed at most this often, to avoid a write on every request. */
const SESSION_REFRESH_MS = 60 * 60_000

// Crockford base32: no I, L, O, U, so the boarding pass is easy to read and type.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_CHARS = 28 // 140 bits
const CODE_GROUP = 4

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export interface AuthenticatedSession {
  sessionId: string
  user: { id: string; username: string }
  expiresAt: Date
  /** True when the expiry moved, so the cookie should be re-sent. */
  refreshed: boolean
}

export class AuthError extends UserError {}

// Password hashing

export const hashPassword = (password: string) => hash(password)

// A valid hash of a random password, verified when the username does not exist so a login attempt
// takes the same time either way.
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hash(randomBytes(16).toString('hex')))

// Failed logins per username, so a password cannot be guessed by spreading attempts over many IPs.
// In memory: it resets on restart, which is acceptable for a single-process MVP.
const LOCKOUT_ATTEMPTS = 10
const LOCKOUT_WINDOW_MS = 15 * 60_000
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
  if (entry && Date.now() - entry.since <= LOCKOUT_WINDOW_MS) entry.count++
  else failures.set(username, { count: 1, since: Date.now() })
}

// Sessions

/** The cookie holds the random token; the database stores only its hash. */
async function createSession(ctx: Ctx, userId: string) {
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
    expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await touchSession(ctx.db, sessionId, expiresAt)
  }
  return { sessionId, user: row.user, expiresAt, refreshed }
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
  return { user: { id: user.id, username: user.username }, ...(await createSession(ctx, user.id)) }
}

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
  return { user: { id: user.id, username: user.username }, ...(await createSession(ctx, user.id)) }
}

/** Recovery from the command line. Signs out every session of that account. */
export async function resetPassword(ctx: Ctx, username: string, password: string) {
  const user = await getUserByUsername(ctx.db, username.trim().toLowerCase())
  if (!user) throw new AuthError(404, 'not_found', `No account named "${username}"`)
  await updatePassword(ctx.db, user.id, await hashPassword(password))
}
