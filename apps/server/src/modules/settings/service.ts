import { sslipDomain } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { getSettings, setSettings } from './repo.ts'

/** First boot only: adopt the LAN IP the installer detected. Afterwards the database owns it. */
export async function seedSettings(ctx: Ctx): Promise<void> {
  const current = await getSettings(ctx.db)
  if (current.lanIp || !ctx.config.lanIp) return
  await setSettings(ctx.db, { lanIp: ctx.config.lanIp, lanDomain: sslipDomain(ctx.config.lanIp) })
  ctx.log.info({ lanIp: ctx.config.lanIp }, 'Seeded LAN address from installer')
}
