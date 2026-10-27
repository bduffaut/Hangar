import { contract } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { type Http, route } from '../../http/server.ts'
import { GithubError } from '../../platform/github.ts'
import { getGithubToken } from '../settings/secrets.ts'

async function requireToken(ctx: Ctx): Promise<string> {
  const token = await getGithubToken(ctx)
  if (!token) {
    throw new UserError(
      409,
      'github_not_connected',
      'Connect a GitHub token in Settings to list repositories.',
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
      'The token may have expired. Connect a new one in Settings.',
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
  const { ctx } = http

  route(http, contract.githubRepos, async () => {
    const token = await requireToken(ctx)
    return ctx.github.listRepos(token).catch(githubFailure)
  })

  route(http, contract.githubBranches, async ({ query }) => {
    const token = await requireToken(ctx)
    return ctx.github.listBranches(token, query.repo).catch(githubFailure)
  })
}
