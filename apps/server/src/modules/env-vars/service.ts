import { ENV_KEY_PATTERN } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { listEnvVars, replaceEnvVars } from './repo.ts'

const aad = (projectId: string, key: string) => `env:${projectId}:${key}`

/** Decrypted env vars for builds and containers. Never log the result. */
export async function getEnv(ctx: Ctx, projectId: string): Promise<Record<string, string>> {
  const rows = await listEnvVars(ctx.db, projectId)
  return Object.fromEntries(
    rows.map((row) => [row.key, ctx.crypto.open(row.valueEncrypted, aad(projectId, row.key))]),
  )
}

/** Replaces the whole set. Takes effect on the next deploy. */
export async function setEnv(
  ctx: Ctx,
  projectId: string,
  vars: Record<string, string>,
): Promise<void> {
  const rows = Object.entries(vars).map(([key, value]) => {
    if (!ENV_KEY_PATTERN.test(key)) throw new Error(`Invalid env var name: ${key}`)
    return { key, valueEncrypted: ctx.crypto.seal(value, aad(projectId, key)) }
  })
  await replaceEnvVars(ctx.db, projectId, rows)
}
