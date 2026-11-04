import { SETTING_DEFAULTS, type Settings, type SettingKey, settingsSchema } from '@hangar/shared'
import { sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { settings } from '../../db/schema.ts'

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(settings)
  const result: Record<string, unknown> = { ...SETTING_DEFAULTS }
  for (const row of rows) {
    if (!Object.hasOwn(settingsSchema, row.key)) continue // a key from a newer/older version
    result[row.key] = settingsSchema[row.key as SettingKey].parse(row.value)
  }
  return result as Settings
}

export async function setSettings(db: Db, patch: Partial<Settings>): Promise<void> {
  const entries = Object.entries(patch) as [SettingKey, unknown][]
  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      const parsed = settingsSchema[key].parse(value)
      // A JS null would become SQL NULL, which the column refuses; a cleared setting is JSON null.
      const stored = parsed === null ? sql`'null'::jsonb` : parsed
      await tx
        .insert(settings)
        .values({ key, value: stored })
        .onConflictDoUpdate({ target: settings.key, set: { value: stored, updatedAt: new Date() } })
    }
  })
}
