import { and, eq, gt, lt, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { sessions, settings, users } from '../../db/schema.ts'

export type User = typeof users.$inferSelect

export async function hasUsers(db: Db): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1)
  return row !== undefined
}

export async function getUserByUsername(db: Db, username: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.username, username))
  return row ?? null
}

/**
 * Creates the first account and clears the setup code, atomically. Returns null if an account
 * already exists or the setup code no longer matches (someone else finished setup first).
 */
export async function insertFirstUser(
  db: Db,
  values: { username: string; passwordHash: string; setupCodeHash: string },
): Promise<User | null> {
  return db.transaction(async (tx) => {
    // Serializes concurrent setup attempts; released at commit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('setup', 0))`)
    const [existing] = await tx.select({ id: users.id }).from(users).limit(1)
    if (existing) return null
    const cleared = await tx
      .update(settings)
      .set({ value: sql`'null'::jsonb` })
      .where(
        and(
          eq(settings.key, 'setupCodeHash'),
          eq(settings.value, sql`${JSON.stringify(values.setupCodeHash)}::jsonb`),
        ),
      )
      .returning({ key: settings.key })
    if (cleared.length === 0) return null
    const [user] = await tx
      .insert(users)
      .values({ username: values.username, passwordHash: values.passwordHash })
      .returning()
    return user!
  })
}

export async function updatePassword(db: Db, userId: string, passwordHash: string) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId))
    // A password change signs out every existing session.
    await tx.delete(sessions).where(eq(sessions.userId, userId))
  })
}

export async function insertSession(
  db: Db,
  values: { id: string; userId: string; expiresAt: Date },
): Promise<void> {
  await db.insert(sessions).values(values)
}

/** A session that has not expired, with its user. */
export async function getActiveSession(db: Db, id: string) {
  const [row] = await db
    .select({ session: sessions, user: { id: users.id, username: users.username } })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
  return row ?? null
}

export async function touchSession(db: Db, id: string, expiresAt: Date): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt }).where(eq(sessions.id, id))
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id))
}

export async function deleteExpiredSessions(db: Db): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id })
  return rows.length
}
