import { GITHUB_WEBHOOK_PATH } from '@hangar/shared'
import { z } from 'zod'
import type { Http } from '../../http/server.ts'
import { queueDeployment } from '../deployments/service.ts'
import { findProject, webhookSecret } from '../projects/service.ts'
import { isValidGithubSignature } from './signature.ts'

const pushEvent = z.object({
  ref: z.string(),
  after: z.string(),
  deleted: z.boolean().optional(),
})

const SHA = /^[0-9a-f]{40}$/
const WEBHOOK_BODY_LIMIT = 10 * 1024 * 1024

/**
 * GitHub push webhooks. Unauthenticated, so nothing happens until the HMAC signature over the raw
 * body checks out against the project's secret.
 */
export function webhookRoutes({ app, ctx }: Http) {
  app.register(async (scope) => {
    // Keep the raw bytes: the signature is over the body exactly as sent.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: WEBHOOK_BODY_LIMIT },
      (_request, body, done) => done(null, body),
    )

    scope.post(
      GITHUB_WEBHOOK_PATH,
      { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const { id } = request.params as { id: string }
        const project = z.uuid().safeParse(id).success ? await findProject(ctx, id) : null
        const body = request.body
        if (!project || !Buffer.isBuffer(body)) {
          return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
        }
        const signature = request.headers['x-hub-signature-256']
        if (
          !isValidGithubSignature(
            webhookSecret(ctx, project),
            body,
            typeof signature === 'string' ? signature : undefined,
          )
        ) {
          return reply
            .code(401)
            .send({ error: { code: 'bad_signature', message: 'Signature does not match' } })
        }

        const event = request.headers['x-github-event']
        if (event === 'ping') return { ok: true }
        if (event !== 'push') return reply.code(202).send({ ignored: `event ${String(event)}` })
        if (project.triggerMode !== 'webhook') {
          return reply.code(202).send({ ignored: 'this project does not deploy on webhooks' })
        }
        if (project.desiredState === 'stopped') {
          return reply.code(202).send({ ignored: 'the app is stopped' })
        }

        let json: unknown = null
        try {
          json = JSON.parse(body.toString('utf8'))
        } catch {
          // handled below as an invalid payload
        }
        const push = pushEvent.safeParse(json)
        if (!push.success) {
          return reply
            .code(400)
            .send({ error: { code: 'invalid_input', message: 'Not a push event' } })
        }
        const { ref, after, deleted } = push.data
        if (ref !== `refs/heads/${project.branch}` || deleted || !SHA.test(after)) {
          return reply.code(202).send({ ignored: 'not a new commit on the deployed branch' })
        }
        const deployment = await queueDeployment(ctx, project, {
          commitSha: after,
          trigger: 'push',
        })
        return reply.code(202).send({ queued: deployment.number })
      },
    )
  })
}
