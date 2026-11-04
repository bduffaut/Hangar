export const DEPLOYMENT_TRIGGERS = ['push', 'poll', 'manual', 'rollback'] as const
export type DeploymentTrigger = (typeof DEPLOYMENT_TRIGGERS)[number]

export const TRIGGER_MODES = ['poll', 'webhook', 'manual'] as const
export type TriggerMode = (typeof TRIGGER_MODES)[number]

export const DESIRED_STATES = ['running', 'stopped'] as const
export type DesiredState = (typeof DESIRED_STATES)[number]

export const LOG_STREAMS = ['stdout', 'stderr', 'system'] as const
export type LogStream = (typeof LOG_STREAMS)[number]

export const USER_ROLES = ['admin', 'member'] as const
export type UserRole = (typeof USER_ROLES)[number]

/** What a one-time link does: create an account, or set a new password on one. */
export const LINK_KINDS = ['invite', 'reset'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

/** What the last real request to a public address found. See modules/addresses/service.ts. */
export const ADDRESS_STATUSES = [
  'live',
  'app_down',
  'not_running',
  'elsewhere',
  'unreachable',
  'no_tunnel',
] as const
export type AddressStatus = (typeof ADDRESS_STATUSES)[number]
