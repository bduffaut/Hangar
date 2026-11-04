import { createInterface } from 'node:readline'
import { contract, schemas, streams } from '@hangar/shared'
import { eventStream, type Http, OK, route } from '../../http/server.ts'
import { queueBranchHead, queueDeployment } from '../deployments/service.ts'
import { deploymentView } from '../deployments/views.ts'
import { refreshAddresses } from '../addresses/service.ts'
import {
  createProject,
  deleteProject,
  followRuntimeLogs,
  ownedProject,
  projectView,
  projectViewsOf,
  restartProject,
  setDesiredState,
  updateProjectSettings,
  webhookInfo,
} from './service.ts'

export function projectRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.listProjects, ({ auth }) => projectViewsOf(ctx, auth.user.id))

  route(http, contract.createProject, async ({ auth, body }) => {
    const { deploy, ...input } = body
    const { project, headSha } = await createProject(ctx, auth.user, input)
    if (deploy !== false) {
      await queueDeployment(ctx, project, { commitSha: headSha, trigger: 'manual' })
    }
    return projectView(ctx, await ownedProject(ctx, auth.user.id, project.id))
  })

  route(http, contract.getProject, async ({ auth, params }) =>
    projectView(ctx, await ownedProject(ctx, auth.user.id, params.id)),
  )

  route(http, contract.updateProject, async ({ auth, params, body }) => {
    const project = await ownedProject(ctx, auth.user.id, params.id)
    return projectView(ctx, await updateProjectSettings(ctx, auth.user.role, project, body))
  })

  route(http, contract.deleteProject, async ({ auth, params }) => {
    await deleteProject(ctx, await ownedProject(ctx, auth.user.id, params.id))
    return OK
  })

  route(http, contract.startProject, async ({ auth, params }) => {
    await setDesiredState(ctx, await ownedProject(ctx, auth.user.id, params.id), 'running')
    return projectView(ctx, await ownedProject(ctx, auth.user.id, params.id))
  })

  route(http, contract.stopProject, async ({ auth, params }) => {
    await setDesiredState(ctx, await ownedProject(ctx, auth.user.id, params.id), 'stopped')
    return projectView(ctx, await ownedProject(ctx, auth.user.id, params.id))
  })

  route(http, contract.restartProject, async ({ auth, params }) => {
    const project = await ownedProject(ctx, auth.user.id, params.id)
    await restartProject(ctx, project)
    return projectView(ctx, project)
  })

  // Waits for the real result. The check goes over the internet, so a few a minute is plenty.
  route(
    http,
    contract.checkProjectAddresses,
    async ({ auth, params }) => {
      const project = await ownedProject(ctx, auth.user.id, params.id)
      await refreshAddresses(ctx, project.id)
      return projectView(ctx, project)
    },
    { rateLimit: 10 },
  )

  route(http, contract.deployProject, async ({ auth, params }) => {
    const project = await ownedProject(ctx, auth.user.id, params.id)
    const deployment = await queueBranchHead(ctx, project, 'manual')
    return deploymentView(deployment, project.currentDeploymentId)
  })

  route(http, contract.projectWebhook, async ({ auth, params }) =>
    webhookInfo(ctx, await ownedProject(ctx, auth.user.id, params.id)),
  )

  // Radio: the live output of the project's running container.
  eventStream(
    http,
    streams.runtimeLogs,
    schemas.idParams,
    (params, request) => ownedProject(ctx, request.auth!.user.id, params.id),
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
