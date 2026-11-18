import type { LinkKind, UserRole } from '@hangar/shared'
import { and, asc, count, eq, gt, lt, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { accessLinks, projects, users } from '../../db/schema.ts'
import type { User } from '../auth/repo.ts'

export type AccessLink = typeof accessLinks.$inferSelect

/** Every account with how many projects it owns. The admin screen shows nothing more of them. */
export async function listUsersWithCounts(db: Db) {
  return db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
      projectCount: count(projects.id),
    })
    .from(users)
    .leftJoin(projects, eq(projects.ownerId, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.createdAt))
}

export async function getUser(db: Db, id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row ?? null
}

/**
 * Changes a role unless that would leave no admin. Returns false in that case. The lock makes two
 * demotions at once take turns, so they cannot each see the other as the remaining admin.
 */
export async function setRole(db: Db, id: string, role: UserRole): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('user-roles', 0))`)
    if (role !== 'admin') {
      const admins = await tx.select({ id: users.id }).from(users).where(eq(users.role, 'admin'))
      if (admins.length === 1 && admins[0]!.id === id) return false
    }
    await tx.update(users).set({ role }).where(eq(users.id, id))
    // Links this person made as an admin would hand back what the demotion took away.
    if (role !== 'admin') await tx.delete(accessLinks).where(eq(accessLinks.createdBy, id))
    return true
  })
}

export async function deleteUser(db: Db, id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id))
}

export async function insertLink(
  db: Db,
  values: {
    kind: LinkKind
    tokenHash: string
    role?: UserRole
    userId?: string
    label?: string | null
    createdBy: string
    expiresAt: Date
  },
): Promise<void> {
  await db.insert(accessLinks).values(values)
}

/** A new reset link replaces any earlier one for the account. */
export async function deleteResetLinksOf(db: Db, userId: string): Promise<void> {
  await db
    .delete(accessLinks)
    .where(and(eq(accessLinks.kind, 'reset'), eq(accessLinks.userId, userId)))
}

export async function findLink(db: Db, tokenHash: string) {
  const [row] = await db
    .select({ link: accessLinks, username: users.username })
    .from(accessLinks)
    .leftJoin(users, eq(accessLinks.userId, users.id))
    .where(and(eq(accessLinks.tokenHash, tokenHash), gt(accessLinks.expiresAt, new Date())))
  return row ?? null
}

/** Uses a link up, atomically: of two redemptions at once, one gets the row. */
export async function takeLink(tx: Db, tokenHash: string): Promise<AccessLink | null> {
  const [row] = await tx
    .delete(accessLinks)
    .where(and(eq(accessLinks.tokenHash, tokenHash), gt(accessLinks.expiresAt, new Date())))
    .returning()
  return row ?? null
}

export async function listOpenInvites(db: Db): Promise<AccessLink[]> {
  return db
    .select()
    .from(accessLinks)
    .where(and(eq(accessLinks.kind, 'invite'), gt(accessLinks.expiresAt, new Date())))
    .orderBy(asc(accessLinks.createdAt))
}

export async function deleteInvite(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .delete(accessLinks)
    .where(and(eq(accessLinks.id, id), eq(accessLinks.kind, 'invite')))
    .returning({ id: accessLinks.id })
  return rows.length > 0
}

export async function deleteExpiredLinks(db: Db): Promise<number> {
  const rows = await db
    .delete(accessLinks)
    .where(lt(accessLinks.expiresAt, new Date()))
    .returning({ id: accessLinks.id })
  return rows.length
}
