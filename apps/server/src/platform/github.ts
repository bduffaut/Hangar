// The few GitHub REST calls Hangar needs: who a token belongs to, listing repositories and
// branches, and creating a push webhook. Polling uses `git ls-remote` instead (decision D4).

const API = 'https://api.github.com'
const TIMEOUT_MS = 10_000
const MAX_PAGES = 5

export class GithubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface GithubRepo {
  fullName: string
  url: string
  private: boolean
  defaultBranch: string
  updatedAt: string | null
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hangar',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new GithubError(response.status, body?.message ?? `GitHub returned ${response.status}`)
  }
  return (await response.json()) as T
}

async function paginate<T>(token: string, path: string): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const separator = path.includes('?') ? '&' : '?'
    const batch = await request<T[]>(token, `${path}${separator}per_page=100&page=${page}`)
    items.push(...batch)
    if (batch.length < 100) break
  }
  return items
}

export function createGithub() {
  return {
    async currentUser(token: string): Promise<{ login: string }> {
      return request(token, '/user')
    },

    async listRepos(token: string): Promise<GithubRepo[]> {
      const repos = await paginate<{
        full_name: string
        html_url: string
        private: boolean
        default_branch: string
        pushed_at: string | null
      }>(token, '/user/repos?sort=pushed&affiliation=owner,collaborator,organization_member')
      return repos.map((repo) => ({
        fullName: repo.full_name,
        url: repo.html_url,
        private: repo.private,
        defaultBranch: repo.default_branch,
        updatedAt: repo.pushed_at,
      }))
    },

    async listBranches(token: string, slug: string): Promise<string[]> {
      const branches = await paginate<{ name: string }>(token, `/repos/${slug}/branches`)
      return branches.map((branch) => branch.name)
    },

    /** Creates a push webhook. Needs a token with permission to administer the repository's hooks. */
    async createPushWebhook(token: string, slug: string, url: string, secret: string) {
      await request(token, `/repos/${slug}/hooks`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['push'],
          config: { url, secret, content_type: 'json', insecure_ssl: '0' },
        }),
      })
    },
  }
}

export type Github = ReturnType<typeof createGithub>
