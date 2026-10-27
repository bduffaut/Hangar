import type { Db } from './client.ts'

/**
 * Runs `fn` while holding a Postgres session advisory lock named `key`, so it is serialized across
 * every Hangar process sharing the database. Always take `project:*` locks before `routing`.
 */
export async function withAdvisoryLock<T>(db: Db, key: string, fn: () => Promise<T>): Promise<T> {
  const client = await db.$client.connect()
  try {
    await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [key])
    return await fn()
  } finally {
    // If unlocking fails, destroy the connection (which releases the lock) rather than returning
    // it to the pool still holding the lock.
    const unlocked = await client
      .query('select pg_advisory_unlock(hashtextextended($1, 0))', [key])
      .then(() => true)
      .catch(() => false)
    client.release(!unlocked)
  }
}

/** Serializes everything that starts, switches, or removes a project's containers. */
export const projectLockKey = (projectId: string) => `project:${projectId}`
