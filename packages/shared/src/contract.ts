// Every JSON endpoint of the API in one place. The server registers its routes from this table and
// the dashboard derives its typed client from it, so the two cannot drift apart.
import { z } from 'zod'
import * as s from './schemas.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * `public`: anyone. `session`: a signed-in user (and a CSRF token for non-GET requests).
 * `admin`: the same, with the admin role.
 */
export type Access = 'public' | 'session' | 'admin'

export interface Endpoint {
  method: HttpMethod
  path: `/api/${string}`
  access: Access
  params?: z.ZodType
  query?: z.ZodType
  body?: z.ZodType
  response: z.ZodType
}

const endpoint = <E extends Endpoint>(e: E) => e

export const contract = {
  health: endpoint({ method: 'GET', path: '/api/health', access: 'public', response: s.health }),

  setupStatus: endpoint({
    method: 'GET',
    path: '/api/setup/status',
    access: 'public',
    response: s.setupStatus,
  }),
  setupComplete: endpoint({
    method: 'POST',
    path: '/api/setup/complete',
    access: 'public',
    body: s.setupComplete,
    response: s.session,
  }),

  login: endpoint({
    method: 'POST',
    path: '/api/auth/login',
    access: 'public',
    body: s.login,
    response: s.session,
  }),
  logout: endpoint({ method: 'POST', path: '/api/auth/logout', access: 'session', response: s.ok }),
  // POST, so the token travels in the body and never lands in a URL or a log.
  checkLink: endpoint({
    method: 'POST',
    path: '/api/auth/link/check',
    access: 'public',
    body: s.linkToken,
    response: s.linkInfo,
  }),
  redeemLink: endpoint({
    method: 'POST',
    path: '/api/auth/link/redeem',
    access: 'public',
    body: s.redeemLink,
    response: s.session,
  }),
  me: endpoint({ method: 'GET', path: '/api/auth/me', access: 'session', response: s.session }),
  changePassword: endpoint({
    method: 'POST',
    path: '/api/me/password',
    access: 'session',
    body: s.changePassword,
    response: s.session,
  }),
  signOutEverywhere: endpoint({
    method: 'POST',
    path: '/api/me/sign-out-everywhere',
    access: 'session',
    response: s.ok,
  }),
  getDashboardLayout: endpoint({
    method: 'GET',
    path: '/api/me/dashboard',
    access: 'session',
    response: s.dashboardLayoutView,
  }),
  saveDashboardLayout: endpoint({
    method: 'PUT',
    path: '/api/me/dashboard',
    access: 'session',
    body: s.dashboardLayout,
    response: s.ok,
  }),

  getSettings: endpoint({
    method: 'GET',
    path: '/api/settings',
    access: 'session',
    response: s.settingsView,
  }),
  updateSettings: endpoint({
    method: 'PATCH',
    path: '/api/settings',
    access: 'admin',
    body: s.settingsPatch,
    response: s.settingsView,
  }),
  setGithubToken: endpoint({
    method: 'POST',
    path: '/api/settings/github',
    access: 'session',
    body: s.githubToken,
    response: s.githubAccount,
  }),
  checkAddress: endpoint({
    method: 'POST',
    path: '/api/settings/check-address',
    access: 'admin',
    body: s.addressCheck,
    response: s.addressCheckResult,
  }),
  setTunnelToken: endpoint({
    method: 'POST',
    path: '/api/settings/tunnel',
    access: 'admin',
    body: s.tunnelToken,
    response: s.settingsView,
  }),

  listUsers: endpoint({
    method: 'GET',
    path: '/api/users',
    access: 'admin',
    response: z.array(s.userView),
  }),
  updateUser: endpoint({
    method: 'PATCH',
    path: '/api/users/:id',
    access: 'admin',
    params: s.idParams,
    body: s.userPatch,
    response: s.userView,
  }),
  deleteUser: endpoint({
    method: 'DELETE',
    path: '/api/users/:id',
    access: 'admin',
    params: s.idParams,
    response: s.ok,
  }),
  createResetLink: endpoint({
    method: 'POST',
    path: '/api/users/:id/reset-link',
    access: 'admin',
    params: s.idParams,
    response: s.createdLink,
  }),
  listInvites: endpoint({
    method: 'GET',
    path: '/api/invites',
    access: 'admin',
    response: z.array(s.inviteView),
  }),
  createInvite: endpoint({
    method: 'POST',
    path: '/api/invites',
    access: 'admin',
    body: s.inviteInput,
    response: s.createdLink,
  }),
  revokeInvite: endpoint({
    method: 'DELETE',
    path: '/api/invites/:id',
    access: 'admin',
    params: s.idParams,
    response: s.ok,
  }),

  githubRepos: endpoint({
    method: 'GET',
    path: '/api/github/repos',
    access: 'session',
    response: z.array(s.githubRepo),
  }),
  githubBranches: endpoint({
    method: 'GET',
    path: '/api/github/branches',
    access: 'session',
    query: s.githubBranchesQuery,
    response: z.array(z.string()),
  }),

  listProjects: endpoint({
    method: 'GET',
    path: '/api/projects',
    access: 'session',
    response: z.array(s.projectView),
  }),
  createProject: endpoint({
    method: 'POST',
    path: '/api/projects',
    access: 'session',
    body: s.projectInput,
    response: s.projectView,
  }),
  getProject: endpoint({
    method: 'GET',
    path: '/api/projects/:id',
    access: 'session',
    params: s.idParams,
    response: s.projectView,
  }),
  updateProject: endpoint({
    method: 'PATCH',
    path: '/api/projects/:id',
    access: 'session',
    params: s.idParams,
    body: s.projectPatch,
    response: s.projectView,
  }),
  deleteProject: endpoint({
    method: 'DELETE',
    path: '/api/projects/:id',
    access: 'session',
    params: s.idParams,
    response: s.ok,
  }),
  startProject: endpoint({
    method: 'POST',
    path: '/api/projects/:id/start',
    access: 'session',
    params: s.idParams,
    response: s.projectView,
  }),
  stopProject: endpoint({
    method: 'POST',
    path: '/api/projects/:id/stop',
    access: 'session',
    params: s.idParams,
    response: s.projectView,
  }),
  restartProject: endpoint({
    method: 'POST',
    path: '/api/projects/:id/restart',
    access: 'session',
    params: s.idParams,
    response: s.projectView,
  }),
  deployProject: endpoint({
    method: 'POST',
    path: '/api/projects/:id/deploy',
    access: 'session',
    params: s.idParams,
    response: s.deploymentView,
  }),
  checkProjectAddresses: endpoint({
    method: 'POST',
    path: '/api/projects/:id/addresses/check',
    access: 'session',
    params: s.idParams,
    response: s.projectView,
  }),
  projectWebhook: endpoint({
    method: 'GET',
    path: '/api/projects/:id/webhook',
    access: 'session',
    params: s.idParams,
    response: s.webhookView,
  }),

  listDeployments: endpoint({
    method: 'GET',
    path: '/api/projects/:id/deployments',
    access: 'session',
    params: s.idParams,
    query: s.deploymentListQuery,
    response: z.array(s.deploymentView),
  }),
  getDeployment: endpoint({
    method: 'GET',
    path: '/api/deployments/:id',
    access: 'session',
    params: s.idParams,
    response: s.deploymentView,
  }),
  deploymentLogs: endpoint({
    method: 'GET',
    path: '/api/deployments/:id/logs',
    access: 'session',
    params: s.idParams,
    query: s.logsQuery,
    response: z.array(s.logLine),
  }),
  cancelDeployment: endpoint({
    method: 'POST',
    path: '/api/deployments/:id/cancel',
    access: 'session',
    params: s.idParams,
    response: s.ok,
  }),
  rollbackDeployment: endpoint({
    method: 'POST',
    path: '/api/deployments/:id/rollback',
    access: 'session',
    params: s.idParams,
    response: s.deploymentView,
  }),

  listEnv: endpoint({
    method: 'GET',
    path: '/api/projects/:id/env',
    access: 'session',
    params: s.idParams,
    response: s.envList,
  }),
  revealEnv: endpoint({
    method: 'GET',
    path: '/api/projects/:id/env/:key/reveal',
    access: 'session',
    params: s.envKeyParams,
    response: s.envValue,
  }),
  replaceEnv: endpoint({
    method: 'PUT',
    path: '/api/projects/:id/env',
    access: 'session',
    params: s.idParams,
    body: s.envReplace,
    response: s.envList,
  }),

  systemInfo: endpoint({
    method: 'GET',
    path: '/api/system/info',
    access: 'admin',
    response: s.systemInfo,
  }),
} as const

export type Contract = typeof contract
export type EndpointName = keyof Contract

// Server-sent event streams (text/event-stream). All require a session.
export const streams = {
  events: '/api/events',
  deploymentLogs: '/api/deployments/:id/logs/stream',
  runtimeLogs: '/api/projects/:id/runtime-logs/stream',
  metrics: '/api/metrics/stream',
} as const

export type StreamName = keyof typeof streams

/** Unauthenticated, HMAC-verified. Reachable from the public entrypoint. */
export const GITHUB_WEBHOOK_PATH = '/api/webhooks/github/:id'
