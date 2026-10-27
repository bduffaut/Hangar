export const TOWER_SUBDOMAIN = 'tower'
export const HOOKS_SUBDOMAIN = 'hooks'

export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  TOWER_SUBDOMAIN,
  HOOKS_SUBDOMAIN,
  'www',
  'api',
  'traefik',
  'hangar',
  'admin',
])

export const PROJECT_NAME_MAX_LENGTH = 40
const PROJECT_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export type ProjectNameProblem = 'empty' | 'too_long' | 'invalid_characters' | 'reserved'

export function checkProjectName(name: string): ProjectNameProblem | null {
  if (name.length === 0) return 'empty'
  if (name.length > PROJECT_NAME_MAX_LENGTH) return 'too_long'
  if (!PROJECT_NAME_PATTERN.test(name)) return 'invalid_characters'
  if (RESERVED_NAMES.has(name)) return 'reserved'
  return null
}

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export function isIpv4(value: string): boolean {
  return IPV4_PATTERN.test(value)
}

/** `192.168.1.50` → `192-168-1-50.sslip.io` */
export function sslipDomain(ip: string): string {
  if (!isIpv4(ip)) throw new Error(`Not an IPv4 address: ${ip}`)
  return `${ip.replaceAll('.', '-')}.sslip.io`
}

export function towerHostname(domain: string): string {
  return `${TOWER_SUBDOMAIN}.${domain}`
}

export function hooksHostname(domain: string): string {
  return `${HOOKS_SUBDOMAIN}.${domain}`
}

export function appHostname(projectName: string, domain: string): string {
  return `${projectName}.${domain}`
}
