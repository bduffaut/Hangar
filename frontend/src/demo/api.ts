import type { EndpointName } from '@hangar/shared'
import {
  demoAccount,
  demoDeployment,
  demoDeployments,
  demoEnvKeys,
  demoLibraries,
  demoProject,
  demoProjects,
  demoRepos,
  demoSession,
  demoSettings,
  demoStats,
  demoStorage,
  demoUsers,
  demoSystemInfo,
  startSimulation,
} from './data.ts'
import { askToSignUp } from './mode.ts'

/** Thrown for anything the tour cannot do; the install prompt opens instead. */
export class DemoActionError extends Error {
  readonly status = 0
  readonly code = 'tour'
  readonly hint = undefined
  constructor(readonly endpoint: string) {
    super('Install Hangar on your own computer to do that.')
  }
}

const notFound = () => Object.assign(new Error('Not found'), { status: 404, code: 'not_found' })

/** Answers one contract call from the sample hangar. */
export async function demoCall(
  name: EndpointName,
  input: { params?: Record<string, unknown>; query?: Record<string, unknown> },
): Promise<unknown> {
  startSimulation()
  // A beat of latency, so loading states look the way they do for real.
  await new Promise((resolve) => setTimeout(resolve, 120))
  const id = String(input.params?.id ?? '')
  switch (name) {
    case 'health':
      return { status: 'ok', version: '0.3.0' }
    case 'me':
      return demoSession
    case 'getAccount':
      return demoAccount
    case 'getDashboardLayout':
      return { layout: null }
    case 'saveDashboardLayout':
      // Customizing the dashboard is part of the tour; the layout just is not kept.
      return { ok: true }
    case 'getSettings':
      return demoSettings
    case 'listUsers':
      return demoUsers
    case 'listInvites':
      return []
    case 'getAccess':
      return { githubApp: null }
    case 'githubRepos':
      return demoRepos
    case 'githubBranches':
      return ['main', 'dev']
    case 'listProjects':
      return demoProjects()
    case 'getProject':
    case 'checkProjectAddresses':
      return demoProject(id) ?? Promise.reject(notFound())
    case 'projectWebhook':
      return {
        url: 'https://hooks.example.com/api/webhooks/github',
        secret: 'sample-secret-for-the-tour',
        contentType: 'application/json',
        active: false,
      }
    case 'listDeployments':
      return demoDeployments(id, Number(input.query?.limit ?? 20))
    case 'getDeployment':
      return demoDeployment(id) ?? Promise.reject(notFound())
    case 'projectStorage':
      return demoStorage(id)
    case 'listLibraries':
      return demoLibraries
    case 'listVolumes':
      return demoProjects().flatMap((p) =>
        demoStorage(p.id).volumes.map((v) => ({
          dockerName: v.dockerName,
          app: p.name,
          orphaned: false,
          sizeBytes: v.sizeBytes,
        })),
      )
    case 'listEnv':
      return { keys: demoEnvKeys }
    case 'revealEnv': {
      const key = String(input.params?.key ?? '')
      const values: Record<string, string> = {
        DATABASE_URL: 'postgres://app:••••••@db:5432/app',
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-long-random-string',
      }
      return { key, value: values[key] ?? '' }
    }
    case 'flightStats':
      return demoStats()
    case 'systemInfo':
      return demoSystemInfo
    case 'checkAddress':
      return { status: 'ok', message: 'This address reaches your server.' }
    case 'logout':
      // Signing out of the tour goes back to the front page.
      window.location.assign('/')
      return { ok: true }
    default:
      askToSignUp(name)
      throw new DemoActionError(name)
  }
}
