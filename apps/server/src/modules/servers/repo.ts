import { and, asc, eq, gt } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { servers } from '../../db/schema.ts'

export type Server = typeof servers.$inferSelect

export async function listServersOf(db: Db, ownerId: string): Promise<Server[]> {
  return db
    .select()
    .from(servers)
    .where(eq(servers.ownerId, ownerId))
    .orderBy(asc(servers.createdAt))
}

/** Only its owner's: anyone else gets null, like a server that does not exist. */
export async function getServerOf(db: Db, id: string, ownerId: string): Promise<Server | null> {
  const [row] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, id), eq(servers.ownerId, ownerId)))
  return row ?? null
}

export async function getServerByCredential(db: Db, credentialHash: string) {
  const [row] = await db.select().from(servers).where(eq(servers.credentialHash, credentialHash))
  return row ?? null
}

export async function insertServer(
  db: Db,
  values: { ownerId: string; name: string; pairingCodeHash: string; pairingExpiresAt: Date },
): Promise<Server> {
  const [row] = await db.insert(servers).values(values).returning()
  return row!
}

export async function updateServer(db: Db, id: string, patch: Partial<Server>): Promise<void> {
  await db.update(servers).set(patch).where(eq(servers.id, id))
}

/**
 * Uses a pairing code up and sets the server's key, atomically: of two servers with the same
 * code, one pairs. A server that paired before gets a new key and its old one stops working.
 */
export async function pairServer(
  db: Db,
  pairingCodeHash: string,
  credentialHash: string,
): Promise<Server | null> {
  const [row] = await db
    .update(servers)
    .set({ credentialHash, pairingCodeHash: null, pairingExpiresAt: null, pairedAt: new Date() })
    .where(
      and(eq(servers.pairingCodeHash, pairingCodeHash), gt(servers.pairingExpiresAt, new Date())),
    )
    .returning()
  return row ?? null
}

export async function deleteServer(db: Db, id: string): Promise<void> {
  await db.delete(servers).where(eq(servers.id, id))
}
