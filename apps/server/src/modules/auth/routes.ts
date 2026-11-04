import { contract } from '@hangar/shared'
import {
  clearSessionCookie,
  type Http,
  OK,
  route,
  sessionView,
  setSessionCookie,
} from '../../http/server.ts'
import { linkInfo, redeemLink } from '../users/service.ts'
import {
  changePassword,
  completeSetup,
  dashboardLayout,
  endSession,
  login,
  needsSetup,
  saveDashboardLayout,
  signOutEverywhere,
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

  route(http, contract.logout, async ({ auth, request, reply }) => {
    await endSession(ctx, auth.sessionId)
    clearSessionCookie(request, reply)
    return OK
  })

  route(http, contract.checkLink, ({ body }) => linkInfo(ctx, body.token), {
    rateLimit: AUTH_RATE_LIMIT,
  })

  route(
    http,
    contract.redeemLink,
    async ({ body, request, reply }) => {
      const result = await redeemLink(ctx, body)
      setSessionCookie(request, reply, result.token, result.expiresAt)
      return sessionView(ctx, result)
    },
    { rateLimit: AUTH_RATE_LIMIT },
  )

  route(
    http,
    contract.changePassword,
    async ({ auth, body, request, reply }) => {
      const result = await changePassword(ctx, auth.user.id, body)
      setSessionCookie(request, reply, result.token, result.expiresAt)
      return sessionView(ctx, result)
    },
    { rateLimit: AUTH_RATE_LIMIT },
  )

  route(http, contract.signOutEverywhere, async ({ auth, request, reply }) => {
    await signOutEverywhere(ctx, auth.user.id)
    clearSessionCookie(request, reply)
    return OK
  })

  route(http, contract.me, async ({ auth }) => sessionView(ctx, auth))

  route(http, contract.getDashboardLayout, async ({ auth }) => dashboardLayout(ctx, auth.user.id))
  route(http, contract.saveDashboardLayout, async ({ auth, body }) => {
    await saveDashboardLayout(ctx, auth.user.id, body.layout)
    return OK
  })
}
