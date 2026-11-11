import { contract } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import {
  authenticate,
  type Http,
  requestOrigin,
  route,
  sessionView,
  setFlowCookie,
  setSessionCookie,
  takeFlowCookie,
} from '../../http/server.ts'
import { GithubError } from '../../platform/github.ts'
import { getGithubToken } from '../settings/secrets.ts'
import {
  accessView,
  accountView,
  completeGithubApp,
  finishGithubFlow,
  githubAppManifest,
  removeGithubApp,
  startGithubFlow,
  updateAccess,
} from './service.ts'

// Per client address, per minute, like the other sign-in endpoints.
const AUTH_RATE_LIMIT = 10

async function requireToken(ctx: Ctx, userId: string): Promise<string> {
  const token = await getGithubToken(ctx, userId)
  if (!token) {
    throw new UserError(
      409,
      'github_not_connected',
      'Connect GitHub under Account to list repositories.',
    )
  }
  return token
}

function githubFailure(error: unknown): never {
  if (error instanceof GithubError && (error.status === 401 || error.status === 403)) {
    throw new UserError(
      400,
      'github_rejected',
      'GitHub refused the request with the saved token.',
      'The connection may have expired. Connect GitHub again under Account.',
    )
  }
  if (error instanceof GithubError && error.status === 404) {
    throw new UserError(
      404,
      'not_found',
      'GitHub could not find that repository with the saved token.',
    )
  }
  throw new UserError(
    502,
    'github_unreachable',
    "Hangar could not reach GitHub. Check the server's internet connection.",
  )
}

export function githubRoutes(http: Http) {
  const { ctx, access } = http

  route(
    http,
    contract.githubStart,
    async ({ body, request, reply }) => {
      const auth = body.purpose === 'link' ? await authenticate(ctx, request, reply) : null
      const { state, url } = await startGithubFlow(
        ctx,
        body,
        requestOrigin(request),
        auth?.user.id ?? null,
      )
      setFlowCookie(request, reply, state)
      return { url }
    },
    { rateLimit: AUTH_RATE_LIMIT },
  )

  route(
    http,
    contract.githubFinish,
    async ({ body, request, reply }) => {
      const result = await finishGithubFlow(ctx, body, {
        cookieState: takeFlowCookie(request, reply),
        currentUserId: async () => (await authenticate(ctx, request, reply)).user.id,
      })
      if (!result.session) return { ...result, session: null }
      const { token, expiresAt } = result.session
      setSessionCookie(request, reply, token, expiresAt)
      return { ...result, session: sessionView(ctx, result.session) }
    },
    { rateLimit: AUTH_RATE_LIMIT },
  )

  route(http, contract.getAccount, ({ auth }) => accountView(ctx, auth.user.id))

  route(http, contract.githubAppManifest, async ({ auth, request }) =>
    githubAppManifest(ctx, auth.user.id, requestOrigin(request), (await access.get()).origins),
  )

  route(http, contract.getAccess, () => accessView(ctx))
  route(http, contract.updateAccess, ({ body }) => updateAccess(ctx, body))

  route(http, contract.githubAppComplete, async ({ auth, body }) => {
    await completeGithubApp(ctx, auth.user.id, body)
    return accessView(ctx)
  })

  route(http, contract.removeGithubApp, async () => {
    await removeGithubApp(ctx)
    return accessView(ctx)
  })

  route(http, contract.githubRepos, async ({ auth }) => {
    const token = await requireToken(ctx, auth.user.id)
    return ctx.github.listRepos(token).catch(githubFailure)
  })

  route(http, contract.githubBranches, async ({ auth, query }) => {
    const token = await requireToken(ctx, auth.user.id)
    return ctx.github.listBranches(token, query.repo).catch(githubFailure)
  })
}
