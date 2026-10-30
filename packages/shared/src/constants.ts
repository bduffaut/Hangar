export const DEFAULT_APP_PORT = 3000
/** Where a Cloudflare Tunnel sends public traffic: Traefik's public entrypoint (installer/traefik.yml). */
export const TUNNEL_SERVICE_URL = 'http://hangar-proxy:8081'
export const DEFAULT_MEMORY_LIMIT_MB = 512

export const BUILD_TIMEOUT_MS = 15 * 60_000
export const HEALTH_CHECK_TIMEOUT_MS = 60_000
export const POLL_INTERVAL_MS = 60_000

export const IMAGES_KEPT_PER_PROJECT = 5
export const LOGS_KEPT_PER_PROJECT = 20

export const HEALTH_CHECK_INTERVAL_MS = 1_000
export const CONTAINER_STOP_GRACE_SECONDS = 10

/** Env var names: what a POSIX shell accepts, so they work as build secret ids and file names. */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * The sample app the Preflight Checklist deploys: a static page in Hangar's own public
 * repository, so the test flight needs nothing but internet access.
 */
export const TEST_FLIGHT = {
  name: 'test-flight',
  repoUrl: 'https://github.com/bduffaut/Hangar',
  branch: 'main',
  rootDir: 'fixtures/static-site',
} as const

/** Domains the owner can add for public access. */
export const MAX_PUBLIC_DOMAINS = 10

/** Public addresses one project may answer on. */
export const MAX_PROJECT_HOSTNAMES = 10
