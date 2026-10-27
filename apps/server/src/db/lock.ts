import { setTimeout as sleep } from 'node:timers/promises'
import type { Db } from './client.ts'

/**
 * Runs `fn` while holding a Postgres session advisory lock named `key`, so it is serialized across
 * every Hangar process sharing the database. Always take `project:*` locks before `routing`.
 *
 * Waiting happens outside the connection pool: a blocking `pg_advisory_lock` would hold a pooled
 * connection while it waits, and enough waiters could take every connection, leaving the lock's
 * holder unable to finish (and so never releasing it).
 */
export async function withAdvisoryLock<T>(db: Db, key: string, fn: () => Promise<T>): Promise<T> {
  const client = await acquire(db, key)
  try {
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

const FIRST_RETRY_MS = 20
const MAX_RETRY_MS = 100

async function acquire(db: Db, key: string) {
  for (let delay = FIRST_RETRY_MS; ; delay = Math.min(delay * 2, MAX_RETRY_MS)) {
    const client = await db.$client.connect()
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'select pg_try_advisory_lock(hashtextextended($1, 0)) as locked',
        [key],
      )
      if (rows[0]?.locked) return client
    } catch (error) {
      client.release(true)
      throw error
    }
    client.release()
    await sleep(delay)
  }
}

/** Serializes everything that starts, switches, or removes a project's containers. */
export const projectLockKey = (projectId: string) => `project:${projectId}`
