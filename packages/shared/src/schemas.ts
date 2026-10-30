// Request and response shapes for the API. Responses are parsed on the way out, so any field not
// listed here (a secret, an internal column) can never leak.
import { z } from 'zod'
import { PROJECT_NAME_MAX_LENGTH } from './hostnames.ts'
import { DEPLOYMENT_TRIGGERS, DESIRED_STATES, LOG_STREAMS, TRIGGER_MODES } from './enums.ts'
import { FAILURE_CODES } from './failures.ts'
import { DEPLOYMENT_STATUSES } from './statuses.ts'
import { ENV_KEY_PATTERN, MAX_PROJECT_DOMAINS } from './constants.ts'
import {
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from './validation.ts'

const id = z.uuid()
const timestamp = z.iso.datetime({ offset: true })
const port = z
  .number({ error: 'The port must be a number from 1 to 65535.' })
  .int()
  .min(1)
  .max(65535)

export const ok = z.object({ ok: z.literal(true) })
export const idParams = z.object({ id })

export const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), hint: z.string().optional() }),
})
export type ErrorBody = z.infer<typeof errorBody>

const MEMORY_LIMIT_PROBLEM = `The memory limit must be a whole number of MB from ${MEMORY_LIMIT_MIN_MB} to ${MEMORY_LIMIT_MAX_MB}.`

// Auth and setup

const username = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, {
  error:
    'Usernames are 3 to 32 characters: lowercase letters, digits, dots, dashes, and underscores.',
})
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `Passwords must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Passwords can be at most ${PASSWORD_MAX_LENGTH} characters.`,
  })

export const setupStatus = z.object({ needsSetup: z.boolean() })
export const setupComplete = z.object({
  setupCode: z
    .string()
    .trim()
    .min(1, { error: 'Enter the setup code the installer printed.' })
    .max(100, { error: 'That setup code is not correct.' }),
  username,
  password,
})
const WRONG_LOGIN = 'The username or password is not correct.'
export const login = z.object({
  username: z.string().max(64, { error: WRONG_LOGIN }),
  password: z.string().max(PASSWORD_MAX_LENGTH, { error: WRONG_LOGIN }),
})
export const session = z.object({
  user: z.object({ id, username: z.string() }),
  /** Send as X-CSRF-Token on every non-GET request. */
  csrfToken: z.string(),
})
export type Session = z.infer<typeof session>

// Dashboard layout

/** Generous for a home screen; keeps one account from storing megabytes of layout. */
const DASHBOARD_LAYOUT_MAX_BYTES = 32_768
const cell = z.int().min(0).max(1000)
/** One widget as the dashboard grid saves it. Other fields the grid adds are kept as they are. */
const dashboardWidget = z.looseObject({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(100),
  x: cell,
  y: cell,
  w: cell,
  h: cell,
})
export const dashboardLayout = z.object({
  layout: z
    .array(dashboardWidget)
    .max(100)
    .refine((widgets) => JSON.stringify(widgets).length <= DASHBOARD_LAYOUT_MAX_BYTES, {
      error: 'The layout is too large.',
    }),
})
/** `layout` is null until the owner customizes the dashboard. */
export const dashboardLayoutView = z.object({ layout: z.array(z.unknown()).nullable() })
export type DashboardLayoutView = z.infer<typeof dashboardLayoutView>

// Settings

export const settingsView = z.object({
  lanIp: z.string().nullable(),
  lanDomain: z.string().nullable(),
  publicDomain: z.string().nullable(),
  exposeTowerPublicly: z.boolean(),
  githubConnected: z.boolean(),
  tunnelConfigured: z.boolean(),
  towerUrl: z.string().nullable(),
})
export type SettingsView = z.infer<typeof settingsView>

export const settingsPatch = z
  .object({
    lanIp: z.ipv4({ error: 'Enter an IPv4 address, like 192.168.1.50.' }),
    publicDomain: z.string().trim().toLowerCase().nullable(),
    exposeTowerPublicly: z.boolean(),
  })
  .partial()
export const githubToken = z.object({
  token: z.string().trim().max(500, { error: 'That GitHub token is too long.' }).nullable(),
})
export const githubAccount = z.object({ connected: z.boolean(), login: z.string().nullable() })
export const tunnelToken = z.object({
  token: z.string().trim().max(4000, { error: 'That tunnel token is too long.' }).nullable(),
})

// GitHub

export const githubRepo = z.object({
  fullName: z.string(),
  url: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
  updatedAt: z.string().nullable(),
})
export const githubBranchesQuery = z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/) })

// Projects

export const projectInput = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, { error: 'Enter a project name.' })
    .max(PROJECT_NAME_MAX_LENGTH, {
      error: `Project names can be at most ${PROJECT_NAME_MAX_LENGTH} characters.`,
    }),
  repoUrl: z.string().trim().max(500, { error: 'That repository address is too long.' }),
  /** Defaults to the repository's default branch. */
  branch: z.string().trim().max(200, { error: 'That branch name is too long.' }).optional(),
  rootDir: z.string().max(500, { error: 'That root directory is too long.' }).optional(),
  /** Omit or null to detect it from the image, falling back to 3000. */
  port: port.nullable().optional(),
  memoryLimitMb: z
    .number({ error: MEMORY_LIMIT_PROBLEM })
    .int()
    .min(MEMORY_LIMIT_MIN_MB)
    .max(MEMORY_LIMIT_MAX_MB)
    .optional(),
  triggerMode: z.enum(TRIGGER_MODES).optional(),
  /** Exact public hostnames, like example.com, served through the Cloudflare Tunnel. */
  domains: z
    .array(z.string().trim().toLowerCase().max(253, { error: 'That domain is too long.' }))
    .max(MAX_PROJECT_DOMAINS, {
      error: `A project can have at most ${MAX_PROJECT_DOMAINS} custom domains.`,
    })
    .optional(),
  /** Deploy the branch head right away (default true). */
  deploy: z.boolean().optional(),
})
export const projectPatch = projectInput
  .pick({
    branch: true,
    rootDir: true,
    port: true,
    memoryLimitMb: true,
    triggerMode: true,
    domains: true,
  })
  .partial()

export const deploymentView = z.object({
  id,
  projectId: id,
  number: z.number().int(),
  commitSha: z.string(),
  commitMessage: z.string().nullable(),
  commitAuthor: z.string().nullable(),
  branch: z.string(),
  status: z.enum(DEPLOYMENT_STATUSES),
  failureCode: z.enum(FAILURE_CODES).nullable(),
  failureReason: z.string().nullable(),
  trigger: z.enum(DEPLOYMENT_TRIGGERS),
  sourceDeploymentId: id.nullable(),
  port: z.number().int().nullable(),
  isCurrent: z.boolean(),
  createdAt: timestamp,
  startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
})
export type DeploymentView = z.infer<typeof deploymentView>

export const projectView = z.object({
  id,
  name: z.string(),
  repoUrl: z.string(),
  branch: z.string(),
  rootDir: z.string(),
  port: z.number().int().nullable(),
  memoryLimitMb: z.number().int(),
  triggerMode: z.enum(TRIGGER_MODES),
  desiredState: z.enum(DESIRED_STATES),
  url: z.string().nullable(),
  publicUrl: z.string().nullable(),
  /** Custom domains; they answer only once public access is set up. */
  domains: z.array(z.string()),
  current: deploymentView.nullable(),
  latest: deploymentView.nullable(),
  /** The most recent deployments, oldest first: the runway lights on a project card. */
  recent: z.array(z.object({ id, number: z.number().int(), status: z.enum(DEPLOYMENT_STATUSES) })),
  createdAt: timestamp,
})
export type ProjectView = z.infer<typeof projectView>

export const webhookView = z.object({
  url: z.string().nullable(),
  secret: z.string(),
  contentType: z.literal('application/json'),
  active: z.boolean(),
})

// Deployments

export const deploymentListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export const logLine = z.object({
  seq: z.number().int(),
  stream: z.enum(LOG_STREAMS),
  line: z.string(),
  ts: timestamp,
})
export type LogLineView = z.infer<typeof logLine>
export const logsQuery = z.object({ after: z.coerce.number().int().min(-1).default(-1) })

// Env vars

const ENV_KEY_PROBLEM =
  'Variable names can use letters, digits, and underscores, cannot start with a digit, and can be at most 200 characters.'
const envKey = z.string().max(200, { error: ENV_KEY_PROBLEM }).regex(ENV_KEY_PATTERN, {
  error: ENV_KEY_PROBLEM,
})
export const envList = z.object({ keys: z.array(envKey) })
export const envKeyParams = z.object({ id, key: envKey })
export const envValue = z.object({ key: envKey, value: z.string() })
export const envReplace = z.object({
  vars: z
    .record(envKey, z.string().max(64 * 1024, { error: 'Each value can be at most 64 KB.' }), {
      error: ENV_KEY_PROBLEM,
    })
    .refine((v) => Object.keys(v).length <= 200, {
      error: 'A project can have at most 200 variables.',
    }),
})

// System

export const health = z.object({ status: z.literal('ok'), version: z.string() })
export const systemInfo = z.object({
  version: z.string(),
  imageDiskBytes: z.number(),
  cpuModel: z.string().nullable(),
  cpuThreads: z.number().int(),
  kernel: z.string().nullable(),
})
export type SystemInfo = z.infer<typeof systemInfo>

// Server-sent events

export const statusEvent = z.object({
  deploymentId: id,
  projectId: id,
  status: z.enum(DEPLOYMENT_STATUSES),
  deployment: deploymentView,
})
export const metricsSample = z.object({
  ts: timestamp,
  host: z.object({
    cpuPercent: z.number(),
    memoryUsedBytes: z.number(),
    memoryTotalBytes: z.number(),
    diskUsedBytes: z.number(),
    diskTotalBytes: z.number(),
    loadAverage: z.number(),
    uptimeSeconds: z.number(),
    /** One reading per kind of sensor (CPU, SSD, …); empty when the machine exposes none. */
    temperatures: z.array(z.object({ name: z.string(), celsius: z.number() })),
    /** Null on machines without a battery. */
    battery: z.object({ percent: z.number(), status: z.string() }).nullable(),
  }),
  containers: z.array(
    z.object({ projectId: id, cpuPercent: z.number(), memoryUsedBytes: z.number() }),
  ),
})
export type MetricsSample = z.infer<typeof metricsSample>
