import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createDb } from '../../src/db/client.ts'
import { withAdvisoryLock } from '../../src/db/lock.ts'
import { DEV_DATABASE_URL } from './harness.ts'

describe('withAdvisoryLock', () => {
  const { db, pool } = createDb(DEV_DATABASE_URL)
  afterAll(() => pool.end())

  it('serializes holders, and many waiters do not starve the holder of connections', async () => {
    // Pool of 10, 30 callers on one key: a blocking lock would park waiters on every connection
    // while the holder needs one more for its own query.
    const key = `test:${crypto.randomUUID()}`
    let inside = 0
    let maxInside = 0
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        withAdvisoryLock(db, key, async () => {
          maxInside = Math.max(maxInside, ++inside)
          await db.execute(sql`select pg_sleep(0.005)`)
          inside--
          return i
        }),
      ),
    )
    expect(results).toHaveLength(30)
    expect(maxInside).toBe(1)
  }, 30_000)
})
