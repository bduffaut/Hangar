import {
  ADDRESS_STATUSES,
  DEPLOYMENT_STATUSES,
  DEPLOYMENT_TRIGGERS,
  DESIRED_STATES,
  FAILURE_CODES,
  LINK_KINDS,
  LOG_STREAMS,
  TRIGGER_MODES,
  USER_ROLES,
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
export const userRole = pgEnum('user_role', USER_ROLES)
export const linkKind = pgEnum('link_kind', LINK_KINDS)
export const addressStatus = pgEnum('address_status', ADDRESS_STATUSES)

export const users = pgTable('users', {
  id: id(),
  username: text().notNull().unique(),
  passwordHash: text().notNull(),
  role: userRole().notNull().default('member'),
  /** The user's own GitHub token, for their own repositories. Encrypted. */
  githubToken: text(),
  /** The home screen's widget layout, as the dashboard saved it. Null means the default. */
  dashboardLayout: jsonb(),
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

/** One-time links an admin hands out: an invite creates an account, a reset sets a password. */
export const accessLinks = pgTable(
  'access_links',
  {
    id: id(),
    kind: linkKind().notNull(),
    tokenHash: text().notNull().unique(), // SHA-256 of the token in the link
    /** The account a reset link is for. Null on an invite. */
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    /** The role an invited account gets. */
    role: userRole().notNull().default('member'),
    label: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
)

export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
})

export const projects = pgTable(
  'projects',
  {
    id: id(),
    /** Restricted: deleting an account removes its projects first, with their containers. */
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
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
    /** Public addresses, like blog.example.com or example.com. Public entrypoint only. */
    hostnames: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    nextDeploymentNumber: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.ownerId)],
)

/** The newest real result for each public address, written by modules/addresses. */
export const addressChecks = pgTable(
  'address_checks',
  {
    hostname: text().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: addressStatus().notNull(),
    message: text().notNull(),
    checkedAt: timestamp({ withTimezone: true }).notNull(),
    lastLiveAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.projectId)],
)

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
