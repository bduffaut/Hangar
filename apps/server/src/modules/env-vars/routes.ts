import { contract } from '@hangar/shared'
import { notFound } from '../../errors.ts'
import { type Http, route } from '../../http/server.ts'
import { getProjectOrThrow } from '../projects/service.ts'
import { getEnv, setEnv } from './service.ts'

export function envVarRoutes(http: Http) {
  const { ctx } = http

  // Keys only: values are masked in the UI and revealed one at a time.
  route(http, contract.listEnv, async ({ params }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    return { keys: Object.keys(await getEnv(ctx, project.id)) }
  })

  route(http, contract.revealEnv, async ({ params }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    const value = (await getEnv(ctx, project.id))[params.key]
    if (value === undefined) throw notFound('Variable')
    return { key: params.key, value }
  })

  route(http, contract.replaceEnv, async ({ params, body }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    await setEnv(ctx, project.id, body.vars)
    return { keys: Object.keys(body.vars).sort() }
  })
}
