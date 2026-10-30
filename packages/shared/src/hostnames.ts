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

/** A public address split against the owner's domains: `blog` on `example.com`, or the root (''). */
export interface PublicAddress {
  subdomain: string
  domain: string
}

/** Splits `blog.example.com` by the longest of `domains` it falls under; null if under none. */
export function splitPublicHostname(
  hostname: string,
  domains: readonly string[],
): PublicAddress | null {
  const domain = [...domains]
    .sort((a, b) => b.length - a.length)
    .find((d) => hostname === d || hostname.endsWith(`.${d}`))
  if (!domain) return null
  return { subdomain: hostname === domain ? '' : hostname.slice(0, -domain.length - 1), domain }
}

export function joinPublicHostname({ subdomain, domain }: PublicAddress): string {
  return subdomain ? `${subdomain}.${domain}` : domain
}

export type PublicHostnameProblem = 'invalid' | 'not_your_domain' | 'too_deep' | 'reserved'

/**
 * Whether `hostname` can be a project's public address: the root of one of the owner's domains or
 * one name directly under it. Deeper names are refused because Cloudflare's free certificate only
 * covers one level, and tower. and hooks. belong to Hangar.
 */
export function checkPublicHostname(
  hostname: string,
  domains: readonly string[],
): PublicHostnameProblem | null {
  const labels = hostname.split('.')
  if (labels.length < 2 || hostname.length > 253 || !labels.every((l) => DNS_LABEL.test(l))) {
    return 'invalid'
  }
  const address = splitPublicHostname(hostname, domains)
  if (!address) return 'not_your_domain'
  if (address.subdomain.includes('.')) return 'too_deep'
  if (address.subdomain === TOWER_SUBDOMAIN || address.subdomain === HOOKS_SUBDOMAIN) {
    return 'reserved'
  }
  return null
}

const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
