import { describe, expect, it } from 'vitest'
import { appAlias } from '../../platform/names.ts'
import { portAddress, portInUseMessage } from './service.ts'

describe('ports on the computer (D51)', () => {
  const ports = [
    { port: 25565, protocol: 'tcp' as const, hostPort: 25565 },
    { port: 19132, protocol: 'udp' as const, hostPort: 19132 },
  ]
  it('explains a port something else holds', () => {
    const error = new Error(
      'driver failed programming external connectivity: Bind for 100.88.12.34:19132 failed: port is already allocated',
    )
    expect(portInUseMessage(error, ports)).toBe(
      'Port 19132 (UDP) is already in use on this computer by something Hangar did not start.',
    )
    expect(portInUseMessage(new Error('no such image'), ports)).toBeNull()
  })
  it('gives the Tailscale name when there is one', () => {
    expect(portAddress({ ip: '100.88.12.34', name: 'hangar.tail1234.ts.net' }, 25565)).toBe(
      'hangar.tail1234.ts.net:25565',
    )
    expect(portAddress({ ip: '100.88.12.34', name: null }, 25565)).toBe('100.88.12.34:25565')
    expect(portAddress({ ip: null, name: null }, 25565)).toBeNull()
  })
})

describe('apps reach each other by name (D50)', () => {
  it('never lets an app answer for Hangar itself', () => {
    expect(appAlias('mosquitto')).toBe('mosquitto')
    expect(appAlias('hangar-core')).toBeNull()
    expect(appAlias('hangar-site')).toBeNull()
  })
})
