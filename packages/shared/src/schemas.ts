// Request and response shapes for the API. Responses are parsed on the way out, so any field not
// listed here (a secret, an internal column) can never leak.
import { z } from 'zod'
import { PROJECT_NAME_MAX_LENGTH } from './hostnames.ts'
import {
  ADDRESS_STATUSES,
  DEPLOYMENT_TRIGGERS,
  DESIRED_STATES,
  LINK_KINDS,
  LOG_STREAMS,
  TRIGGER_MODES,
  USER_ROLES,
} from './enums.ts'
import { FAILURE_CODES } from './failures.ts'
import { DEPLOYMENT_STATUSES } from './statuses.ts'
import { ENV_KEY_PATTERN, MAX_PROJECT_HOSTNAMES, MAX_PUBLIC_DOMAINS } from './constants.ts'
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

export const setupStatus = z.object({
  needsSetup: z.boolean(),
  /** Whether the sign-in page offers "Sign in with GitHub". */
  githubSignIn: z.boolean(),
})
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
  user: z.object({ id, username: z.string(), role: z.enum(USER_ROLES) }),
  /** Send as X-CSRF-Token on every non-GET request. */
  csrfToken: z.string(),
})
export type Session = z.infer<typeof session>

export const changePassword = z.object({
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH, { error: WRONG_LOGIN }),
  newPassword: password,
})

// One-time links: an invite creates an account, a reset sets a new password. There is no sign-up.

const linkTokenValue = z.string().trim().min(1).max(100)
export const linkToken = z.object({ token: linkTokenValue })
export const linkInfo = z.object({
  valid: z.boolean(),
  kind: z.enum(LINK_KINDS).nullable(),
  /** The account a reset link is for. */
  username: z.string().nullable(),
})
export const redeemLink = z.object({
  token: linkTokenValue,
  /** Required on an invite; a reset link already belongs to an account. */
  username: username.optional(),
  password,
})
export const createdLink = z.object({
  /** Shown once. Only its hash is stored, so it can never be read back. */
  token: z.string(),
  expiresAt: timestamp,
})
export type CreatedLink = z.infer<typeof createdLink>

export const userView = z.object({
  id,
  username: z.string(),
  role: z.enum(USER_ROLES),
  projectCount: z.number().int(),
  createdAt: timestamp,
})
export type UserView = z.infer<typeof userView>
export const userPatch = z.object({ role: z.enum(USER_ROLES) })
export const inviteInput = z.object({
  role: z.enum(USER_ROLES).default('member'),
  /** A note for the admin, like who the link is for. */
  label: z.string().trim().max(100, { error: 'Keep the note under 100 characters.' }).optional(),
})
export const inviteView = z.object({
  id,
  role: z.enum(USER_ROLES),
  label: z.string().nullable(),
  expiresAt: timestamp,
  createdAt: timestamp,
})
export type InviteView = z.infer<typeof inviteView>

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
  /** The server's domains for public access; the first is the default. */
  publicDomains: z.array(z.string()),
  defaultDomain: z.string().nullable(),
  exposeTowerPublicly: z.boolean(),
  /** Whether the signed-in user has connected their own GitHub token. */
  githubConnected: z.boolean(),
  tunnelConfigured: z.boolean(),
  towerUrl: z.string().nullable(),
  /** The GitHub App for "Sign in with GitHub", once an admin has created it. */
  githubApp: z
    .object({
      slug: z.string(),
      owner: z.string(),
      /** The app's page on GitHub, where its owner manages it. */
      settingsUrl: z.string(),
      /** Where a person chooses which repositories Hangar may see. */
      installUrl: z.string(),
    })
    .nullable(),
})
export type SettingsView = z.infer<typeof settingsView>

export const settingsPatch = z
  .object({
    lanIp: z.ipv4({ error: 'Enter an IPv4 address, like 192.168.1.50.' }),
    /** The whole list, default first. */
    publicDomains: z
      .array(z.string().trim().toLowerCase().max(253, { error: 'That domain is too long.' }))
      .max(MAX_PUBLIC_DOMAINS, { error: `Hangar can use at most ${MAX_PUBLIC_DOMAINS} domains.` }),
    exposeTowerPublicly: z.boolean(),
  })
  .partial()
export const githubToken = z.object({
  token: z.string().trim().max(500, { error: 'That GitHub token is too long.' }).nullable(),
})
export const githubAccount = z.object({ connected: z.boolean(), login: z.string().nullable() })

/** The signed-in person's own sign-in methods and GitHub connection. */
export const accountView = z.object({
  hasPassword: z.boolean(),
  github: z.object({
    /** Hangar holds a working token for this person's repositories. */
    connected: z.boolean(),
    /** `app` came from Connect with GitHub; `token` was pasted by hand. */
    kind: z.enum(['app', 'token']).nullable(),
    /** The GitHub account they sign in with, if any. */
    login: z.string().nullable(),
  }),
})
export type AccountView = z.infer<typeof accountView>
export const setFirstPassword = z.object({ password })

// Sign in with GitHub (D37). GitHub sends the browser back to /auth/github with a code and the
// state Hangar made, and the dashboard hands both to githubFinish.

export const GITHUB_PURPOSES = ['login', 'link', 'invite'] as const
export type GithubPurpose = (typeof GITHUB_PURPOSES)[number]
export const githubStart = z.object({
  purpose: z.enum(GITHUB_PURPOSES),
  /** The invite being accepted, for `invite`. */
  token: linkTokenValue.optional(),
  /** For `invite`: a username of their choice, instead of their GitHub name. */
  username: username.optional(),
})
export const githubRedirect = z.object({ url: z.string() })
const oauthCode = z.string().trim().min(1).max(200)
export const githubFinish = z.object({ code: oauthCode, state: z.string().min(1).max(100) })
export const githubFinished = z.object({
  purpose: z.enum(GITHUB_PURPOSES),
  /** A new session, after signing in or creating an account. */
  session: session.nullable(),
  /** No repositories are shared with Hangar yet: send them to `installUrl`. */
  needsInstall: z.boolean(),
  installUrl: z.string().nullable(),
})
export type GithubFinished = z.infer<typeof githubFinished>
/** A form the dashboard posts to GitHub, which creates the app and comes back with a code. */
export const githubAppManifest = z.object({ action: z.string(), manifest: z.string() })
export const tunnelToken = z.object({
  token: z.string().trim().max(4000, { error: 'That tunnel token is too long.' }).nullable(),
})

/** Whether a public address reaches this Hangar. `wildcard` probes a random name under a domain. */
export const addressCheck = z.object({
  hostname: z.string().trim().toLowerCase().max(253),
  wildcard: z.boolean().optional(),
})
export const ADDRESS_CHECK_STATUSES = ['ok', 'elsewhere', 'unreachable', 'no_tunnel'] as const
export const addressCheckResult = z.object({
  status: z.enum(ADDRESS_CHECK_STATUSES),
  /** What was found, and what to do about it, in plain words. */
  message: z.string(),
})
export type AddressCheckResult = z.infer<typeof addressCheckResult>

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
  /**
   * Public addresses, each the root of one of the owner's domains or one name under it. Omit for
   * the default, `<name>.<default domain>`; an empty list keeps the app on the network only.
   */
  hostnames: z
    .array(z.string().trim().toLowerCase().max(253, { error: 'That address is too long.' }))
    .max(MAX_PROJECT_HOSTNAMES, {
      error: `A project can have at most ${MAX_PROJECT_HOSTNAMES} public addresses.`,
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
    hostnames: true,
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

/** The newest real result for one public address. `checking` until the first one is in. */
export const addressView = z.object({
  hostname: z.string(),
  url: z.string(),
  status: z.enum([...ADDRESS_STATUSES, 'checking']),
  /** What was found, and what to do about it, in plain words. */
  message: z.string().nullable(),
  checkedAt: timestamp.nullable(),
  /** The last time the address answered. */
  lastLiveAt: timestamp.nullable(),
})
export type AddressView = z.infer<typeof addressView>

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
  /** Public addresses (hostnames) and the same as https:// URLs. */
  hostnames: z.array(z.string()),
  publicUrls: z.array(z.string()),
  addresses: z.array(addressView),
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
export const addressEvent = z.object({ projectId: id, addresses: z.array(addressView) })
export type AddressEvent = z.infer<typeof addressEvent>
export const metricsSample = z.object({
  ts: timestamp,
  /** Readings of the whole server: admins only. */
  host: z
    .object({
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
    })
    .nullable(),
  containers: z.array(
    z.object({ projectId: id, cpuPercent: z.number(), memoryUsedBytes: z.number() }),
  ),
})
export type MetricsSample = z.infer<typeof metricsSample>
