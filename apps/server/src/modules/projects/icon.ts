import type { Ctx } from '../../context.ts'
import { upstreamHost } from '../../worker/app-container.ts'
import { appUpstreamUrl } from '../../platform/proxy.ts'
import { listCurrentDeployments } from './repo.ts'

// App icons for the launcher (D45): the running app's own favicon, fetched by core from its
// container on the account network, never from an address the app names elsewhere. The
// dashboard's CSP allows images from its own origin only, so icons come through here.

export interface AppIcon {
  type: string
  body: Buffer
}

const TYPES = new Set([
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
  'image/gif',
  'image/webp',
  'image/jpeg',
])
const MAX_ICON_BYTES = 256 * 1024
const MAX_PAGE_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 2_000
const MAX_REDIRECTS = 3
/** Icons rarely change; a new deployment gets a fresh lookup anyway (the key includes it). */
const CACHE_MS = 60 * 60_000
/** No icon yet may mean the app is still starting: ask again sooner. */
const MISS_CACHE_MS = 5 * 60_000
const cache = new Map<string, { icon: AppIcon | null; at: number }>()

/**
 * Fetches a path from the app, following redirects only within the app itself. Returns null for
 * anything else: an error, a timeout, a redirect elsewhere, or a body over `limit`.
 */
async function fetchFromApp(
  origin: string,
  path: string | URL,
  limit: number,
): Promise<{ type: string; body: Buffer; url: URL } | null> {
  // `new URL` drops a default port (:80), so compare normalized origins.
  const allowed = new URL(origin).origin
  let url = new URL(path, allowed)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.origin !== allowed) return null
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null)
    if (!response) return null
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel()
      url = new URL(location, url)
      continue
    }
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > limit) {
      await response.body?.cancel()
      return null
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > limit) return null
    const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    return { type, body, url }
  }
  return null
}

/** The first `<link rel="... icon ...">` of a page, biggest declared size first. */
export function iconLinks(html: string): string[] {
  const links: { href: string; size: number }[] = []
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
        .exec(tag)
        ?.slice(2)
        .find((v) => v !== undefined)
    const rel = attr('rel')?.toLowerCase().split(/\s+/) ?? []
    const href = attr('href')
    if (!href || !(rel.includes('icon') || rel.includes('apple-touch-icon'))) continue
    const size = Number(/(\d+)x\d+/.exec(attr('sizes') ?? '')?.[1] ?? 0)
    links.push({ href, size })
  }
  return links.sort((a, b) => b.size - a.size).map((l) => l.href)
}

/** The icon an app at `origin` serves, looked up the way a browser would. */
export async function findIcon(origin: string): Promise<AppIcon | null> {
  const asIcon = (found: { type: string; body: Buffer } | null): AppIcon | null =>
    found && TYPES.has(found.type) && found.body.length > 0
      ? { type: found.type, body: found.body }
      : null
  // The page's own icon links first: apps like Jellyfin and Paperless keep theirs off /favicon.ico.
  const page = await fetchFromApp(origin, '/', MAX_PAGE_BYTES)
  if (page?.type === 'text/html') {
    for (const href of iconLinks(page.body.toString('utf8')).slice(0, 4)) {
      if (href.startsWith('data:')) continue
      // Relative to the page it came from: Jellyfin's lives under /web/.
      const icon = asIcon(await fetchFromApp(origin, new URL(href, page.url), MAX_ICON_BYTES))
      if (icon) return icon
    }
  }
  return asIcon(await fetchFromApp(origin, '/favicon.ico', MAX_ICON_BYTES))
}

/** The icon of a project's running app, or null when it is not running or has none. */
export async function projectIcon(ctx: Ctx, projectId: string): Promise<AppIcon | null> {
  const [row] = await listCurrentDeployments(ctx.db, projectId)
  if (!row || row.project.desiredState !== 'running' || row.deployment.port === null) return null
  const key = `${projectId}:${row.deployment.number}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < (hit.icon ? CACHE_MS : MISS_CACHE_MS)) return hit.icon
  const origin = new URL(
    appUpstreamUrl({
      host: await upstreamHost(ctx, row.project, row.deployment.number),
      port: row.deployment.port,
    }),
  ).origin
  const icon = await findIcon(origin)
  for (const k of cache.keys()) if (k.startsWith(`${projectId}:`)) cache.delete(k)
  cache.set(key, { icon, at: Date.now() })
  return icon
}
