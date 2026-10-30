import { contract } from '@hangar/shared'
import {
  clearSessionCookie,
  type Http,
  OK,
  route,
  sessionView,
  setSessionCookie,
} from '../../http/server.ts'
import {
  completeSetup,
  dashboardLayout,
  endSession,
  login,
  needsSetup,
  saveDashboardLayout,
} from './service.ts'

// Per client address, per minute. Failed logins are also limited per username (see service.ts).
const AUTH_RATE_LIMIT = 10

export function authRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.setupStatus, async () => ({ needsSetup: await needsSetup(ctx) }))

  route(
    http,
    contract.setupComplete,
    async ({ body, request, reply }) => {
      const result = await completeSetup(ctx, body)
      setSessionCookie(request, reply, result.token, result.expiresAt)
      return sessionView(ctx, result)
    },
    { rateLimit: AUTH_RATE_LIMIT },
  )

  route(
    http,
    contract.login,
    async ({ body, request, reply }) => {
      const result = await login(ctx, body.username, body.password)
      setSessionCookie(request, reply, result.token, result.expiresAt)
      return sessionView(ctx, result)
    },
    { rateLimit: AUTH_RATE_LIMIT },
  )

  route(http, contract.logout, async ({ auth, reply }) => {
    await endSession(ctx, auth.sessionId)
    clearSessionCookie(reply)
    return OK
  })

  route(http, contract.me, async ({ auth }) => sessionView(ctx, auth))

  route(http, contract.getDashboardLayout, async ({ auth }) => dashboardLayout(ctx, auth.user.id))
  route(http, contract.saveDashboardLayout, async ({ auth, body }) => {
    await saveDashboardLayout(ctx, auth.user.id, body.layout)
    return OK
  })
}
