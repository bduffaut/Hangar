import { createHmac } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'

const base64Key = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64-encoded')

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HANGAR_ROLE: z.enum(['all', 'api', 'worker']).default('all'),
  HANGAR_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HANGAR_VERSION: z.string().min(1).default('dev'),
  HANGAR_LAN_IP: z.ipv4().optional(),
  HANGAR_INSTANCE_KEY: base64Key,
  HANGAR_SESSION_SECRET: z.string().min(32),
  HANGAR_TRAEFIK_DYNAMIC_DIR: z.string().min(1).default('/var/lib/hangar/traefik'),
  HANGAR_TRAEFIK_API_URL: z.url().default('http://hangar-proxy:8082'),
  HANGAR_CORE_URL: z.url().default('http://hangar-core:3000'),
  // Only this host's addresses may set X-Forwarded-For.
  HANGAR_PROXY_HOST: z.string().min(1).default('hangar-proxy'),
  HANGAR_MIGRATIONS_DIR: z.string().min(1).optional(),
  HANGAR_RAILPACK_FRONTEND: z.string().min(1).optional(), // set by the core image
  HANGAR_BUILD_DIR: z.string().min(1).default('/tmp/hangar-builds'),
  // The built Control Tower (frontend/dist). Served by core when the folder exists.
  HANGAR_WEB_DIR: z.string().min(1).default('/app/web'),
  HANGAR_HOST_PROC: z.string().min(1).default('/proc'),
  HANGAR_HOST_ROOT: z.string().min(1).default('/'),
  HANGAR_HOST_SYS: z.string().min(1).default('/sys'),
  // Extra browser origins allowed to call the API, comma-separated (development only).
  HANGAR_DEV_ORIGINS: z.string().default(''),
  // This machine's name on the owner's Tailscale network, like hangar.tail1234.ts.net (D40). The
  // Control Tower answers there over HTTPS, through `tailscale serve`.
  HANGAR_TAILSCALE_HOSTNAME: z
    .string()
    // Usually <machine>.<tailnet>.ts.net; Headscale and custom MagicDNS names are other domains.
    .regex(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]\.?$/i)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // '1' when `tailscale serve` gives that name HTTPS; otherwise it answers on plain HTTP over
  // Tailscale (still encrypted by Tailscale itself).
  HANGAR_TAILSCALE_HTTPS: z.enum(['0', '1', '']).default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.string().default('development'),
})

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    )
    throw new ConfigError(
      `Hangar cannot start because its configuration is invalid:\n${problems.join('\n')}`,
    )
  }
  const e = parsed.data
  return {
    databaseUrl: e.DATABASE_URL,
    role: e.HANGAR_ROLE,
    port: e.HANGAR_PORT,
    version: e.HANGAR_VERSION,
    lanIp: e.HANGAR_LAN_IP ?? null,
    instanceKey: Buffer.from(e.HANGAR_INSTANCE_KEY, 'base64'),
    sessionSecret: e.HANGAR_SESSION_SECRET,
    proxyApiKey: createHmac('sha256', e.HANGAR_SESSION_SECRET).update('proxy-api').digest('hex'),
    traefikDynamicDir: e.HANGAR_TRAEFIK_DYNAMIC_DIR,
    traefikApiUrl: e.HANGAR_TRAEFIK_API_URL,
    coreUrl: e.HANGAR_CORE_URL,
    proxyHost: e.HANGAR_PROXY_HOST,
    migrationsDir: e.HANGAR_MIGRATIONS_DIR ?? path.resolve('drizzle'),
    railpackFrontend: e.HANGAR_RAILPACK_FRONTEND ?? null,
    buildDir: e.HANGAR_BUILD_DIR,
    webDir: e.HANGAR_WEB_DIR,
    hostProcDir: e.HANGAR_HOST_PROC,
    hostRootDir: e.HANGAR_HOST_ROOT,
    hostSysDir: e.HANGAR_HOST_SYS,
    devOrigins:
      e.NODE_ENV === 'production'
        ? []
        : e.HANGAR_DEV_ORIGINS.split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    tailscaleHostname: e.HANGAR_TAILSCALE_HOSTNAME?.toLowerCase().replace(/\.$/, '') ?? null,
    tailscaleHttps: e.HANGAR_TAILSCALE_HTTPS === '1',
    logLevel: e.LOG_LEVEL,
    isProduction: e.NODE_ENV === 'production',
  }
}

export type Config = ReturnType<typeof loadConfig>
