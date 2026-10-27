import {
  DEPLOYMENT_STATUSES,
  DEPLOYMENT_TRIGGERS,
  DESIRED_STATES,
  FAILURE_CODES,
  LOG_STREAMS,
  TRIGGER_MODES,
  DEFAULT_MEMORY_LIMIT_MB,
} from '@hangar/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

// Columns are camelCase here and snake_case in Postgres (casing: 'snake_case').

const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`)
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

export const deploymentStatus = pgEnum('deployment_status', DEPLOYMENT_STATUSES)
export const deploymentTrigger = pgEnum('deployment_trigger', DEPLOYMENT_TRIGGERS)
export const failureCode = pgEnum('failure_code', FAILURE_CODES)
export const triggerMode = pgEnum('trigger_mode', TRIGGER_MODES)
export const desiredState = pgEnum('desired_state', DESIRED_STATES)
export const logStream = pgEnum('log_stream', LOG_STREAMS)

export const users = pgTable('users', {
  id: id(),
  username: text().notNull().unique(),
  passwordHash: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(), // SHA-256 of the session token
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
)

export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
})

export const projects = pgTable('projects', {
  id: id(),
  name: text().notNull().unique(),
  repoUrl: text().notNull(),
  branch: text().notNull(),
  rootDir: text().notNull().default(''),
  port: integer(), // null = auto-detect
  memoryLimitMb: integer().notNull().default(DEFAULT_MEMORY_LIMIT_MB),
  triggerMode: triggerMode().notNull().default('poll'),
  webhookSecret: text(), // encrypted
  lastSeenSha: text(),
  currentDeploymentId: uuid().references((): AnyPgColumn => deployments.id, {
    onDelete: 'set null',
  }),
  desiredState: desiredState().notNull().default('running'),
  nextDeploymentNumber: integer().notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const deployments = pgTable(
  'deployments',
  {
    id: id(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer().notNull(),
    commitSha: text().notNull(),
    commitMessage: text(),
    commitAuthor: text(),
    branch: text().notNull(),
    status: deploymentStatus().notNull().default('queued'),
    failureCode: failureCode(),
    failureReason: text(),
    imageTag: text(),
    /** SHA-256 of the env vars a build used (see builder.ts), to detect a stale build cache. */
    secretsHash: text(),
    containerId: text(),
    port: integer(),
    trigger: deploymentTrigger().notNull(),
    sourceDeploymentId: uuid().references((): AnyPgColumn => deployments.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique().on(t.projectId, t.number),
    index('deployments_active_idx')
      .on(t.status)
      .where(sql`${t.status} in ('queued', 'building', 'deploying')`),
  ],
)

export const deploymentLogs = pgTable(
  'deployment_logs',
  {
    deploymentId: uuid()
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    seq: integer().notNull(),
    stream: logStream().notNull(),
    line: text().notNull(),
    ts: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.deploymentId, t.seq] })],
)

export const envVars = pgTable(
  'env_vars',
  {
    id: id(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    valueEncrypted: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.projectId, t.key)],
)
