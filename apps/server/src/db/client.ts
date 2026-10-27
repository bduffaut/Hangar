import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.ts'

export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool }

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // Fail loudly instead of waiting forever if the pool is ever exhausted.
    connectionTimeoutMillis: 30_000,
  })
  const db = drizzle(pool, { schema, casing: 'snake_case' })
  return { pool, db }
}
