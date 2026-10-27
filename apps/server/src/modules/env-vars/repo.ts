import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { envVars } from '../../db/schema.ts'

export async function listEnvVars(db: Db, projectId: string) {
  return db
    .select({ key: envVars.key, valueEncrypted: envVars.valueEncrypted })
    .from(envVars)
    .where(eq(envVars.projectId, projectId))
    .orderBy(envVars.key)
}

export async function replaceEnvVars(
  db: Db,
  projectId: string,
  rows: { key: string; valueEncrypted: string }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(envVars).where(eq(envVars.projectId, projectId))
    if (rows.length > 0) await tx.insert(envVars).values(rows.map((row) => ({ ...row, projectId })))
  })
}
