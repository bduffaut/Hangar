// Request and response shapes for the API. Responses are parsed on the way out, so any field not
// listed here (a secret, an internal column) can never leak.
import { z } from 'zod'
import { PROJECT_NAME_MAX_LENGTH } from './hostnames.ts'
import { DEPLOYMENT_TRIGGERS, DESIRED_STATES, LOG_STREAMS, TRIGGER_MODES } from './enums.ts'
import { FAILURE_CODES } from './failures.ts'
import { DEPLOYMENT_STATUSES } from './statuses.ts'
import { ENV_KEY_PATTERN } from './constants.ts'
import {
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from './validation.ts'

const id = z.uuid()
const timestamp = z.iso.datetime({ offset: true })
const port = z.number().int().min(1).max(65535)

export const ok = z.object({ ok: z.literal(true) })
export const idParams = z.object({ id })

export const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), hint: z.string().optional() }),
})
export type ErrorBody = z.infer<typeof errorBody>

// Auth and setup

const username = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, {
  error: '3–32 characters: lowercase letters, digits, dot, dash, underscore',
})
const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH)

export const setupStatus = z.object({ needsSetup: z.boolean() })
export const setupComplete = z.object({
  setupCode: z.string().min(1).max(100),
  username,
  password,
})
export const login = z.object({
  username: z.string().max(64),
  password: z.string().max(PASSWORD_MAX_LENGTH),
})
export const session = z.object({
  user: z.object({ id, username: z.string() }),
  /** Send as X-CSRF-Token on every non-GET request. */
  csrfToken: z.string(),
})
export type Session = z.infer<typeof session>

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
    lanIp: z.ipv4(),
    publicDomain: z.string().trim().toLowerCase().nullable(),
    exposeTowerPublicly: z.boolean(),
  })
  .partial()
export const githubToken = z.object({ token: z.string().trim().max(500).nullable() })
export const githubAccount = z.object({ connected: z.boolean(), login: z.string().nullable() })
export const tunnelToken = z.object({ token: z.string().trim().max(4000).nullable() })

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
  name: z.string().trim().toLowerCase().min(1).max(PROJECT_NAME_MAX_LENGTH),
  repoUrl: z.string().trim().max(500),
  /** Defaults to the repository's default branch. */
  branch: z.string().trim().max(200).optional(),
  rootDir: z.string().max(500).optional(),
  /** Omit or null to detect it from the image, falling back to 3000. */
  port: port.nullable().optional(),
  memoryLimitMb: z.number().int().min(MEMORY_LIMIT_MIN_MB).max(MEMORY_LIMIT_MAX_MB).optional(),
  triggerMode: z.enum(TRIGGER_MODES).optional(),
  /** Deploy the branch head right away (default true). */
  deploy: z.boolean().optional(),
})
export const projectPatch = projectInput
  .pick({ branch: true, rootDir: true, port: true, memoryLimitMb: true, triggerMode: true })
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

const envKey = z.string().regex(ENV_KEY_PATTERN).max(200)
export const envList = z.object({ keys: z.array(envKey) })
export const envKeyParams = z.object({ id, key: envKey })
export const envValue = z.object({ key: envKey, value: z.string() })
export const envReplace = z.object({
  vars: z.record(envKey, z.string().max(64 * 1024)).refine((v) => Object.keys(v).length <= 200, {
    error: 'At most 200 variables',
  }),
})

// System

export const health = z.object({ status: z.literal('ok'), version: z.string() })
export const systemInfo = z.object({
  version: z.string(),
  imageDiskBytes: z.number(),
})

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
  }),
  containers: z.array(
    z.object({ projectId: id, cpuPercent: z.number(), memoryUsedBytes: z.number() }),
  ),
})
export type MetricsSample = z.infer<typeof metricsSample>
