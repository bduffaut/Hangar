import { createHash, randomBytes } from 'node:crypto'
import { LINK_TTL_MS, type UserRole } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { users } from '../../db/schema.ts'
import { notFound, UserError } from '../../errors.ts'
import { ownerBuilderName, ownerNetworkName } from '../../platform/names.ts'
import { deleteSessions, replacePassword } from '../auth/repo.ts'
import { createSession, hashPassword, sessionUser } from '../auth/service.ts'
import { listProjectsOf } from '../projects/repo.ts'
import { deleteProject } from '../projects/service.ts'
import {
  deleteInvite,
  deleteResetLinksOf,
  deleteUser as deleteUserRow,
  findLink,
  getUser,
  insertLink,
  listOpenInvites,
  listUsersWithCounts,
  setRole,
  takeLink,
} from './repo.ts'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** The token goes to the admin once; the database keeps only its hash. */
function newLink() {
  const token = randomBytes(24).toString('base64url')
  return { token, tokenHash: sha256(token), expiresAt: new Date(Date.now() + LINK_TTL_MS) }
}

const LAST_ADMIN = 'Hangar needs at least one admin. Make someone else an admin first.'

export async function userViews(ctx: Ctx) {
  const rows = await listUsersWithCounts(ctx.db)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

export async function changeRole(ctx: Ctx, id: string, role: UserRole) {
  if (!(await getUser(ctx.db, id))) throw notFound('Account')
  if (!(await setRole(ctx.db, id, role))) {
    throw new UserError(409, 'last_admin', LAST_ADMIN)
  }
  return (await userViews(ctx)).find((user) => user.id === id)!
}

/** Signs the account out, then removes its projects (with containers and images) and the account. */
export async function removeUser(ctx: Ctx, adminId: string, id: string): Promise<void> {
  if (id === adminId) {
    throw new UserError(409, 'cannot_delete_self', 'You cannot delete your own account.')
  }
  if (!(await getUser(ctx.db, id))) throw notFound('Account')
  await deleteSessions(ctx.db, id)
  for (const project of await listProjectsOf(ctx.db, id)) await deleteProject(ctx, project)
  await deleteUserRow(ctx.db, id)
  await ctx.builder.removeBuilder(ownerBuilderName(id))
  await ctx.docker.removeAppNetwork(ownerNetworkName(id))
}

export async function createInvite(
  ctx: Ctx,
  adminId: string,
  input: { role: UserRole; label?: string },
) {
  const { token, tokenHash, expiresAt } = newLink()
  await insertLink(ctx.db, {
    kind: 'invite',
    tokenHash,
    role: input.role,
    label: input.label || null,
    createdBy: adminId,
    expiresAt,
  })
  return { token, expiresAt: expiresAt.toISOString() }
}

export async function createResetLink(ctx: Ctx, adminId: string, userId: string) {
  if (!(await getUser(ctx.db, userId))) throw notFound('Account')
  const { token, tokenHash, expiresAt } = newLink()
  await deleteResetLinksOf(ctx.db, userId)
  await insertLink(ctx.db, {
    kind: 'reset',
    tokenHash,
    userId,
    createdBy: adminId,
    expiresAt,
  })
  return { token, expiresAt: expiresAt.toISOString() }
}

export async function inviteViews(ctx: Ctx) {
  const rows = await listOpenInvites(ctx.db)
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    label: row.label,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function revokeInvite(ctx: Ctx, id: string): Promise<void> {
  if (!(await deleteInvite(ctx.db, id))) throw notFound('Invite')
}

export async function linkInfo(ctx: Ctx, token: string) {
  const found = await findLink(ctx.db, sha256(token))
  return {
    valid: found !== null,
    kind: found?.link.kind ?? null,
    username: found?.link.kind === 'reset' ? found.username : null,
  }
}

const BAD_LINK = () =>
  new UserError(
    400,
    'invalid_link',
    'This link has expired or was already used.',
    'Ask your admin for a new one.',
  )

/**
 * Creates the invited account, or sets a new password. The link is used up in the same transaction,
 * so it works once, and a taken username leaves it usable. Resetting signs out every session.
 */
export async function redeemLink(
  ctx: Ctx,
  input: { token: string; username?: string; password: string },
) {
  const passwordHash = await hashPassword(input.password)
  const tokenHash = sha256(input.token)
  let user
  try {
    user = await ctx.db.transaction(async (tx) => {
      const link = await takeLink(tx as unknown as Ctx['db'], tokenHash)
      if (!link) throw BAD_LINK()
      // A link is only as good as its maker. Demotion deletes their links, and this closes the
      // moment in between.
      const maker = await getUser(tx as unknown as Ctx['db'], link.createdBy)
      if (maker?.role !== 'admin') throw BAD_LINK()
      if (link.kind === 'reset') {
        await replacePassword(tx as unknown as Ctx['db'], link.userId!, passwordHash)
        return getUser(tx as unknown as Ctx['db'], link.userId!)
      }
      if (!input.username) {
        throw new UserError(400, 'invalid_input', 'Choose a username.')
      }
      const [created] = await tx
        .insert(users)
        .values({ username: input.username, passwordHash, role: link.role })
        .returning()
      return created ?? null
    })
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === '23505') {
      throw new UserError(409, 'username_taken', 'That username is taken. Pick another one.')
    }
    throw error
  }
  if (!user) throw BAD_LINK()
  return {
    user: sessionUser(user),
    ...(await createSession(ctx, user.id)),
  }
}
