// Input rules shared by the API and the dashboard. Anything that reaches git, Docker, or a
// hostname is checked here first.
import { ENV_KEY_PATTERN } from './constants.ts'

/** Branch names per `git check-ref-format --branch`, minus rarely used corner cases. */
export function isValidBranchName(name: string): boolean {
  if (name.length === 0 || name.length > 200) return false
  if (name.startsWith('-') || name.startsWith('/') || name.endsWith('/')) return false
  if (name.endsWith('.') || name.endsWith('.lock') || name === '@') return false
  if (name.includes('..') || name.includes('//') || name.includes('@{')) return false
  if (name.split('/').some((part) => part.startsWith('.'))) return false
  // Control characters, space, ~ ^ : ? * [ \ and DEL are not allowed anywhere.
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x20~^:?*[\\\x7f]/.test(name)
}

// https://host[:port]/path, no credentials, query, fragment, or whitespace.
const REPO_URL_PATTERN = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?\/[^\s?#@\\]+$/i

/** Repositories are cloned over HTTPS only, without credentials in the URL. */
export function isValidRepoUrl(value: string): boolean {
  return value.length <= 500 && REPO_URL_PATTERN.test(value)
}

/** `owner/name` for a github.com repository URL, or null. */
export function githubRepoSlug(repoUrl: string): string | null {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repoUrl)
  return match ? `${match[1]}/${match[2]}` : null
}

const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/** A lowercase DNS name with at least two labels, e.g. `example.com`. */
export function isValidDomain(value: string): boolean {
  if (value.length > 253) return false
  const labels = value.split('.')
  return labels.length >= 2 && labels.every((label) => DOMAIN_LABEL.test(label))
}

/** `''` for the repository root; otherwise a relative path without `.`/`..` segments. */
export function normalizeRootDir(value: string): string | null {
  const trimmed = value
    .trim()
    .replace(/^\.?\/+/, '')
    .replace(/\/+$/, '')
  if (trimmed === '' || trimmed === '.') return ''
  const parts = trimmed.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\\]/.test(trimmed)) return null
  return trimmed
}

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,31}$/
export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 256

export const MEMORY_LIMIT_MIN_MB = 64
export const MEMORY_LIMIT_MAX_MB = 65536

/** Parses a whole number typed into a form, or null if it is not one within [min, max]. */
export function parseWholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const value = Number(text.trim())
  return value >= min && value <= max ? value : null
}

/**
 * Reads `.env` text: one `KEY=value` per line; blank lines and `#` comments are skipped, a leading
 * `export ` is allowed, and matching quotes around a value are removed. Returns the variables and
 * the numbers of lines that could not be read.
 */
export function parseDotenv(text: string): { vars: Record<string, string>; badLines: number[] } {
  const vars: Record<string, string> = {}
  const badLines: number[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const match = /^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/.exec(line)
    if (!match || !ENV_KEY_PATTERN.test(match[1]!)) {
      badLines.push(i + 1)
      return
    }
    let value = match[2]!
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1)
    }
    vars[match[1]!] = value
  })
  return { vars, badLines }
}
