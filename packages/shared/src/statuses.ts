export const DEPLOYMENT_STATUSES = [
  'queued',
  'building',
  'deploying',
  'ready',
  'failed',
  'cancelled',
] as const

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

// queued → deploying is only valid for rollbacks; the deployment service enforces that.
export const DEPLOYMENT_TRANSITIONS: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  queued: ['building', 'deploying', 'cancelled'],
  building: ['deploying', 'failed', 'cancelled'],
  deploying: ['ready', 'failed'],
  ready: [],
  failed: [],
  cancelled: [],
}

export const ACTIVE_DEPLOYMENT_STATUSES = ['queued', 'building', 'deploying'] as const

export function canTransition(from: DeploymentStatus, to: DeploymentStatus): boolean {
  return DEPLOYMENT_TRANSITIONS[from].includes(to)
}

export function isTerminal(status: DeploymentStatus): boolean {
  return DEPLOYMENT_TRANSITIONS[status].length === 0
}
