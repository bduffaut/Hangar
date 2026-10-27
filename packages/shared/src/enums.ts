export const DEPLOYMENT_TRIGGERS = ['push', 'poll', 'manual', 'rollback'] as const
export type DeploymentTrigger = (typeof DEPLOYMENT_TRIGGERS)[number]

export const TRIGGER_MODES = ['poll', 'webhook', 'manual'] as const
export type TriggerMode = (typeof TRIGGER_MODES)[number]

export const DESIRED_STATES = ['running', 'stopped'] as const
export type DesiredState = (typeof DESIRED_STATES)[number]

export const LOG_STREAMS = ['stdout', 'stderr', 'system'] as const
export type LogStream = (typeof LOG_STREAMS)[number]
