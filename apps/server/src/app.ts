import type { Ctx } from './context.ts'
import { createHttpServer } from './http/server.ts'
import { addSecurityHeaders, serveDashboard } from './http/web.ts'
import { authRoutes } from './modules/auth/routes.ts'
import { deploymentRoutes } from './modules/deployments/routes.ts'
import { envVarRoutes } from './modules/env-vars/routes.ts'
import { githubRoutes } from './modules/github/routes.ts'
import { metricsRoutes } from './modules/metrics/routes.ts'
import { projectRoutes } from './modules/projects/routes.ts'
import { settingsRoutes } from './modules/settings/routes.ts'
import { systemRoutes } from './modules/system/routes.ts'
import { webhookRoutes } from './modules/webhooks/routes.ts'

export function buildApp(ctx: Ctx) {
  const http = createHttpServer(ctx)
  addSecurityHeaders(http.app)
  // Routes go in a child scope so they register after the cookie and rate-limit plugins load.
  http.app.register(async (scope) => {
    const scoped = { ...http, app: scope }
    systemRoutes(scoped)
    authRoutes(scoped)
    settingsRoutes(scoped)
    githubRoutes(scoped)
    projectRoutes(scoped)
    deploymentRoutes(scoped)
    envVarRoutes(scoped)
    metricsRoutes(scoped)
    webhookRoutes(scoped)
    await serveDashboard(scoped)
  })
  return http.app
}
