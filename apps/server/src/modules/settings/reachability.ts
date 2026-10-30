import { randomBytes } from 'node:crypto'
import { type AddressCheckResult, checkPublicHostname } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { ADDRESS_CHECK_PATH } from '../../platform/proxy.ts'
import { getSettings } from './repo.ts'

// Checks that a public address really reaches this Hangar: core issues a one-time token, asks
// for https://<address>/.well-known/hangar-check/<token> over the internet, and the request comes
// back through Cloudflare and the tunnel to core, which confirms only tokens it issued.

const CHECK_TIMEOUT_MS = 10_000
const pending = new Set<string>()

/** True for a token issued by a check that is still waiting for its answer. */
export const isPendingCheck = (token: string) => pending.has(token)

export async function checkAddress(
  ctx: Ctx,
  input: { hostname: string; wildcard?: boolean },
): Promise<AddressCheckResult> {
  const settings = await getSettings(ctx.db)
  const hostname = input.hostname.replace(/^https?:\/\//, '').replace(/[/.]+$/, '')
  if (
    input.wildcard
      ? !settings.publicDomains.includes(hostname)
      : checkPublicHostname(hostname, settings.publicDomains)
  ) {
    // Only the owner's own addresses: this never becomes a way to make core fetch arbitrary hosts.
    throw new UserError(400, 'not_your_address', `${hostname} is not one of your addresses.`)
  }
  if (!settings.cloudflareTunnelToken) {
    return {
      status: 'no_tunnel',
      message:
        'Hangar has no tunnel yet, so nothing reaches it from the internet. Add the tunnel token first.',
    }
  }

  const target = input.wildcard
    ? `hangar-check-${randomBytes(3).toString('hex')}.${hostname}`
    : hostname
  const fix = input.wildcard
    ? `In Cloudflare, add the public hostname *.${hostname} to Hangar's tunnel, with the service shown above.`
    : `In Cloudflare, add the public hostname ${hostname} to Hangar's tunnel, with the service shown above.`
  const token = randomBytes(16).toString('hex')
  pending.add(token)
  try {
    const response = await fetch(`https://${target}${ADDRESS_CHECK_PATH}${token}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    const body = await response.text().catch(() => '')
    if (response.status === 200 && body.trim() === 'ok') {
      return {
        status: 'ok',
        message: input.wildcard
          ? `Names under ${hostname} reach this Hangar through its tunnel.`
          : `${hostname} reaches this Hangar through its tunnel.`,
      }
    }
    if (response.status === 530) {
      return {
        status: 'unreachable',
        message: `Cloudflare knows ${input.wildcard ? `names under ${hostname}` : hostname}, but no running tunnel answers for it. ${fix}`,
      }
    }
    return {
      status: 'elsewhere',
      message: `${input.wildcard ? `Names under ${hostname} reach` : `${hostname} reaches`} a different server, not this Hangar. ${fix}`,
    }
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return { status: 'unreachable', message: `${target} has no DNS record yet. ${fix}` }
    }
    ctx.log.info({ err: error, target }, 'Address check failed')
    return {
      status: 'unreachable',
      message: `${target} did not answer within ${CHECK_TIMEOUT_MS / 1000} seconds. Check the server's internet connection, then: ${fix}`,
    }
  } finally {
    pending.delete(token)
  }
}
