export const FAILURE_CODES = [
  'clone_failed',
  'build_failed',
  'build_timeout',
  'image_missing',
  'container_start_failed',
  'health_check_failed',
  'interrupted',
  'superseded',
  'cancelled_by_user',
  'internal',
] as const

export type FailureCode = (typeof FAILURE_CODES)[number]
