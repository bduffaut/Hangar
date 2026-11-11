// The few GitHub REST calls Hangar needs: who a token belongs to, listing repositories and
// branches, and creating a push webhook. Polling uses `git ls-remote` instead (decision D4).
// Sign in with GitHub (D37) adds the OAuth code exchange, token renewal, and creating the app.

const API = 'https://api.github.com'
const OAUTH = 'https://github.com/login/oauth'
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

/** The app's own credentials, for the OAuth endpoints. */
export interface GithubAppCredentials {
  clientId: string
  clientSecret: string
}

/** A user token from the GitHub App. It runs out (8 hours by default) and is renewed. */
export interface GithubUserTokens {
  accessToken: string
  /** Null when the app's tokens do not expire. */
  expiresAt: Date | null
  refreshToken: string | null
}

/** What GitHub returns when it creates an app from a manifest. Its private key is not kept. */
export interface CreatedGithubApp {
  id: number
  slug: string
  clientId: string
  clientSecret: string
  owner: string
  htmlUrl: string
}

/** GitHub answers OAuth errors with 200 and an `error` field. */
async function oauthToken(body: Record<string, string>): Promise<GithubUserTokens> {
  const response = await fetch(`${OAUTH}/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'hangar',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = (await response.json().catch(() => null)) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
    error?: string
    error_description?: string
  } | null
  if (!response.ok || !data?.access_token) {
    // 401 for a refused code or refresh token, so callers treat it like a rejected token.
    const status = response.ok ? 401 : response.status
    throw new GithubError(status, data?.error_description ?? data?.error ?? 'GitHub refused')
  }
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    refreshToken: data.refresh_token ?? null,
  }
}

/** User tokens of a GitHub App (ghu_) see only the repositories the app was installed on. */
const isAppUserToken = (token: string) => token.startsWith('ghu_')

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
    async currentUser(token: string): Promise<{ id: number; login: string }> {
      return request(token, '/user')
    },

    /** Turns the code GitHub sent back after sign-in into a user token. */
    exchangeCode(app: GithubAppCredentials, code: string, redirectUri: string) {
      return oauthToken({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code,
        redirect_uri: redirectUri,
      })
    },

    /** A new user token. The refresh token works once: the answer carries the next one. */
    refreshToken(app: GithubAppCredentials, refreshToken: string) {
      return oauthToken({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
    },

    /** How many accounts or organizations have shared repositories with the app. */
    async countInstallations(token: string): Promise<number> {
      const body = await request<{ total_count: number }>(token, '/user/installations?per_page=1')
      return body.total_count
    },

    /** Finishes the manifest flow: GitHub created the app and hands over its credentials once. */
    async createAppFromManifest(code: string): Promise<CreatedGithubApp> {
      const response = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'hangar',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null
        throw new GithubError(
          response.status,
          body?.message ?? `GitHub returned ${response.status}`,
        )
      }
      const app = (await response.json()) as {
        id: number
        slug: string
        client_id: string
        client_secret: string
        owner: { login: string }
        html_url: string
      }
      return {
        id: app.id,
        slug: app.slug,
        clientId: app.client_id,
        clientSecret: app.client_secret,
        owner: app.owner.login,
        htmlUrl: app.html_url,
      }
    },

    async listRepos(token: string): Promise<GithubRepo[]> {
      type Repo = {
        full_name: string
        html_url: string
        private: boolean
        default_branch: string
        pushed_at: string | null
      }
      let repos: Repo[]
      if (isAppUserToken(token)) {
        repos = []
        const { installations } = await request<{ installations: { id: number }[] }>(
          token,
          '/user/installations?per_page=100',
        )
        for (const installation of installations) {
          for (let page = 1; page <= MAX_PAGES; page++) {
            const batch = await request<{ repositories: Repo[] }>(
              token,
              `/user/installations/${installation.id}/repositories?per_page=100&page=${page}`,
            )
            repos.push(...batch.repositories)
            if (batch.repositories.length < 100) break
          }
        }
        repos.sort((a, b) => (b.pushed_at ?? '').localeCompare(a.pushed_at ?? ''))
      } else {
        repos = await paginate<Repo>(
          token,
          '/user/repos?sort=pushed&affiliation=owner,collaborator,organization_member',
        )
      }
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
