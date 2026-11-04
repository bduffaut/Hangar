import type { AddressStatus } from '@hangar/shared'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { addressChecks } from '../../db/schema.ts'

export type AddressCheck = typeof addressChecks.$inferSelect

export async function listChecks(db: Db, projectIds: string[]): Promise<AddressCheck[]> {
  if (projectIds.length === 0) return []
  return db.select().from(addressChecks).where(inArray(addressChecks.projectId, projectIds))
}

/** Saves a result. `lastLiveAt` only moves when the address really answered. */
export async function saveCheck(
  db: Db,
  values: { hostname: string; projectId: string; status: AddressStatus; message: string },
): Promise<void> {
  const now = new Date()
  const live = values.status === 'live'
  await db
    .insert(addressChecks)
    .values({ ...values, checkedAt: now, lastLiveAt: live ? now : null })
    .onConflictDoUpdate({
      target: addressChecks.hostname,
      set: {
        projectId: values.projectId,
        status: values.status,
        message: values.message,
        checkedAt: now,
        lastLiveAt: live ? now : sql`${addressChecks.lastLiveAt}`,
      },
    })
}

/** Forgets the results of addresses the project no longer has. */
export async function deleteOtherChecks(db: Db, projectId: string, keep: string[]): Promise<void> {
  await db
    .delete(addressChecks)
    .where(
      and(
        eq(addressChecks.projectId, projectId),
        keep.length ? notInArray(addressChecks.hostname, keep) : undefined,
      ),
    )
}
