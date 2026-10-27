import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type pg from 'pg'

// Any number of Hangar processes may start at once; the advisory lock makes them migrate one at a time.
const MIGRATION_LOCK_ID = 7_401_202

export async function runMigrations(pool: pg.Pool, migrationsFolder: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {})
    client.release()
  }
}
