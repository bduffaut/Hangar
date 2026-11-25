import {
  checkHostPort,
  hostPortProblemCopy,
  MAX_APP_PORTS,
  portLabel,
  type PortProtocol,
} from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { getSettings } from '../settings/repo.ts'
import { listAllPorts, portHolders } from './repo.ts'

// Ports that are not web pages (D51): published by Docker on the computer's Tailscale address
// only (HANGAR_LAN_IP, which the installer sets to it, D40), never on every network it is on.

export class PortError extends UserError {
  constructor(message: string, hint?: string) {
    super(400, 'invalid_port', message, hint)
  }
}

export interface WantedPort {
  port: number
  protocol: PortProtocol
  hostPort: number
}

/** Checks ports before an app gets them: allowed numbers, and free on the computer. */
export async function checkPorts(ctx: Ctx, ports: WantedPort[], projectId?: string): Promise<void> {
  if (ports.length > MAX_APP_PORTS) {
    throw new PortError(`An app can publish at most ${MAX_APP_PORTS} ports.`)
  }
  for (const p of ports) {
    const problem = checkHostPort(p.hostPort) ?? checkHostPort(p.port)
    if (problem) throw new PortError(`Port ${portLabel(p)}: ${hostPortProblemCopy[problem]}`)
  }
  const taken = (await portHolders(ctx.db, ports)).filter((h) => h.app !== projectId)
  const [first] = taken
  if (first) {
    throw new UserError(
      409,
      'port_taken',
      `Port ${portLabel(first)} is already used by the app ${first.app}.`,
      `Stop and delete ${first.app}, or install this app on another computer.`,
    )
  }
}

/** The address the computer publishes ports on, or null when Hangar does not know it yet. */
export async function portHost(ctx: Ctx): Promise<{ ip: string | null; name: string | null }> {
  const { lanIp } = await getSettings(ctx.db)
  return { ip: lanIp ?? null, name: ctx.config.tailscaleHostname }
}

/** Every port apps hold on the computer, for admins (Settings → Network). */
export async function portList(ctx: Ctx) {
  const host = await portHost(ctx)
  return (await listAllPorts(ctx.db)).map((p) => ({ ...p, address: portAddress(host, p.hostPort) }))
}

/** What people type to reach a port: the machine's Tailscale name, or its address. */
export function portAddress(host: { ip: string | null; name: string | null }, hostPort: number) {
  const where = host.name ?? host.ip
  return where ? `${where}:${hostPort}` : null
}

/**
 * Docker's own refusal to publish a port, in plain words: something Hangar did not start (another
 * program, or a container of the other site on this computer) already listens there.
 */
export function portInUseMessage(error: unknown, ports: WantedPort[]): string | null {
  const message = error instanceof Error ? error.message : String(error)
  if (!/address already in use|port is already allocated/i.test(message)) return null
  const port = ports.find((p) => message.includes(`:${p.hostPort}`)) ?? ports[0]
  return port
    ? `Port ${portLabel(port)} is already in use on this computer by something Hangar did not start.`
    : null
}
