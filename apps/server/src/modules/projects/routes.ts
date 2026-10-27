import { createInterface } from 'node:readline'
import { contract, schemas, streams } from '@hangar/shared'
import { eventStream, type Http, OK, route } from '../../http/server.ts'
import { queueBranchHead, queueDeployment } from '../deployments/service.ts'
import { deploymentView } from '../deployments/views.ts'
import {
  allProjectViews,
  createProject,
  deleteProject,
  followRuntimeLogs,
  getProjectOrThrow,
  projectView,
  restartProject,
  setDesiredState,
  updateProjectSettings,
  webhookInfo,
} from './service.ts'


export function projectRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.listProjects, () => allProjectViews(ctx))

  route(http, contract.createProject, async ({ body }) => {
    const { deploy, ...input } = body
    const { project, headSha } = await createProject(ctx, input)
    if (deploy !== false) {
      await queueDeployment(ctx, project, { commitSha: headSha, trigger: 'manual' })
    }
    return projectView(ctx, await getProjectOrThrow(ctx, project.id))
  })

  route(http, contract.getProject, async ({ params }) =>
    projectView(ctx, await getProjectOrThrow(ctx, params.id)),
  )

  route(http, contract.updateProject, async ({ params, body }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    return projectView(ctx, await updateProjectSettings(ctx, project, body))
  })

  route(http, contract.deleteProject, async ({ params }) => {
    await deleteProject(ctx, await getProjectOrThrow(ctx, params.id))
    return OK
  })

  route(http, contract.startProject, async ({ params }) => {
    await setDesiredState(ctx, await getProjectOrThrow(ctx, params.id), 'running')
    return projectView(ctx, await getProjectOrThrow(ctx, params.id))
  })

  route(http, contract.stopProject, async ({ params }) => {
    await setDesiredState(ctx, await getProjectOrThrow(ctx, params.id), 'stopped')
    return projectView(ctx, await getProjectOrThrow(ctx, params.id))
  })

  route(http, contract.restartProject, async ({ params }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    await restartProject(ctx, project)
    return projectView(ctx, project)
  })

  route(http, contract.deployProject, async ({ params }) => {
    const project = await getProjectOrThrow(ctx, params.id)
    const deployment = await queueBranchHead(ctx, project, 'manual')
    return deploymentView(deployment, project.currentDeploymentId)
  })

  route(http, contract.projectWebhook, async ({ params }) =>
    webhookInfo(ctx, await getProjectOrThrow(ctx, params.id)),
  )

  // Radio: the live output of the project's running container.
  eventStream(
    http,
    streams.runtimeLogs,
    schemas.idParams,
    (params) => getProjectOrThrow(ctx, params.id),
    async (stream, project) => {
      const output = await followRuntimeLogs(ctx, project, stream.signal)
      if (!output) {
        stream.send('end', { reason: 'not_running' })
        return stream.close()
      }
      stream.onClose(() => output.destroy())
      const lines = createInterface({ input: output, crlfDelay: Infinity })
      lines.on('line', (line) => stream.send('log', { line }))
      lines.on('close', () => {
        stream.send('end', { reason: 'container_stopped' })
        stream.close()
      })
    },
  )
}
