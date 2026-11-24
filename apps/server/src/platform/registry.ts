// Reading public image registries (D47): the tags of a repository, for update checks. Anonymous
// only, through the token challenge every registry speaks (Docker Hub, ghcr.io, quay.io, lscr.io):
// ask, get a 401 naming where to fetch a token, fetch one, ask again.

const TIMEOUT_MS = 10_000
/**
 * Registries list tags in no useful order, so all pages are read. Immich has over 34,000 tags (a
 * build per commit) with its newest release near the end; this allows 100,000.
 */
const MAX_PAGES = 100

/** Where a repository lives: `jellyfin/jellyfin` is `registry-1.docker.io`, `library/...` for one-word names. */
export function registryLocation(repository: string): { host: string; path: string } {
  const [first, ...rest] = repository.split('/')
  const isHost =
    rest.length > 0 && (first!.includes('.') || first!.includes(':') || first === 'localhost')
  if (isHost)
    return { host: first === 'docker.io' ? 'registry-1.docker.io' : first!, path: rest.join('/') }
  return {
    host: 'registry-1.docker.io',
    path: rest.length === 0 ? `library/${first}` : repository,
  }
}

/** The bearer token a 401's `WWW-Authenticate` points to, fetched anonymously. */
async function tokenFor(challenge: string): Promise<string | null> {
  if (!/^bearer /i.test(challenge)) return null
  const params = Object.fromEntries(
    [...challenge.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key!, value!]),
  )
  if (!params.realm?.startsWith('https://')) return null
  const url = new URL(params.realm)
  if (params.service) url.searchParams.set('service', params.service)
  if (params.scope) url.searchParams.set('scope', params.scope)
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) return null
  const body = (await response.json()) as { token?: string; access_token?: string }
  return body.token ?? body.access_token ?? null
}

/** Every tag of a public repository, or throws when the registry cannot be read. */
export async function listTags(repository: string): Promise<string[]> {
  const { host, path } = registryLocation(repository)
  let url: URL | null = new URL(`https://${host}/v2/${path}/tags/list?n=1000`)
  let token: string | null = null
  const tags: string[] = []
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const ask = () =>
      fetch(url!, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    let response = await ask()
    if (response.status === 401 && !token) {
      token = await tokenFor(response.headers.get('www-authenticate') ?? '')
      if (!token) throw new Error(`${host} wants a sign-in to list ${path}`)
      response = await ask()
    }
    if (!response.ok) throw new Error(`${host} answered ${response.status} for ${path}`)
    const body = (await response.json()) as { tags?: string[] | null }
    tags.push(...(body.tags ?? []))
    // The next page, if any: Link: </v2/...?last=x&n=1000>; rel="next"
    const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1]
    url = next ? new URL(next, url) : null
    if (url && url.host !== host) url = null
  }
  return tags
}
