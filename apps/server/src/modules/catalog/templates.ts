import { catalogApp, type CatalogApp } from '@hangar/shared'
import type { Ctx } from '../../context.ts'

/**
 * Templates that exist only for the integration tests, when `HANGAR_TEST_TEMPLATES=1` outside
 * production: a small stack (D44) that pulls in seconds, so real deploys can exercise services,
 * the stack network, secrets, and service storage without downloading a real app's gigabytes.
 */
const TEST_TEMPLATES: CatalogApp[] = [
  {
    id: 'stack-test',
    name: 'Stack test',
    category: 'developer',
    summary: 'A two-part app for Hangar’s own tests.',
    description: 'whoami in front of a Valkey cache.',
    website: 'https://github.com/bduffaut/Hangar',
    image: 'traefik/whoami:v1.11',
    port: 80,
    memoryLimitMb: 128,
    volumes: [],
    env: { CACHE_HOST: 'redis' },
    secrets: ['TEST_SECRET'],
    addressEnv: 'PUBLIC_ORIGINS',
    services: [
      {
        name: 'redis',
        image:
          'valkey/valkey:9@sha256:418652cfb58ef879d4978c33553735d7147016032d5aefaa14c828e611eb9dfd',
        memoryLimitMb: 128,
        env: { SECRET_COPY: '${TEST_SECRET}' },
        volumes: [{ name: 'cache', mountPath: '/data', purpose: 'Cache', backup: false }],
        healthCommand: 'valkey-cli ping | grep -q PONG',
      },
    ],
    firstVisitorIsAdmin: false,
    firstSteps: ['Nothing to set up.'],
    tier: 'elevated',
  },
  {
    // Starting files (D53): written into a kept folder once, never over the owner's edits.
    id: 'files-test',
    name: 'Files test',
    category: 'developer',
    summary: 'An app with a starting settings file, for Hangar’s own tests.',
    description: 'whoami with a kept folder Hangar writes a file into.',
    website: 'https://github.com/bduffaut/Hangar',
    image: 'traefik/whoami:v1.11',
    port: 80,
    memoryLimitMb: 64,
    volumes: [{ name: 'settings', mountPath: '/settings', purpose: 'Settings', backup: true }],
    files: [{ volume: 'settings', path: 'conf/app.conf', content: 'greeting=hello\n' }],
    env: {},
    firstVisitorIsAdmin: false,
    firstSteps: ['Nothing to set up.'],
    tier: 'standard',
  },
  {
    // The computer's own network (D54), offered like Home Assistant's.
    id: 'host-test',
    name: 'Host network test',
    category: 'developer',
    summary: 'An app on the computer’s own network, for Hangar’s own tests.',
    description: 'whoami on a port of its own.',
    website: 'https://github.com/bduffaut/Hangar',
    image: 'traefik/whoami:v1.11',
    port: 18181,
    hostNetwork: { hint: 'Run on the computer’s own network.' },
    memoryLimitMb: 64,
    volumes: [],
    env: { WHOAMI_PORT_NUMBER: '18181' },
    firstVisitorIsAdmin: false,
    firstSteps: ['Nothing to set up.'],
    tier: 'standard',
  },
]

/** A catalog template by id, including the test ones when they are switched on. */
export function findTemplate(ctx: Ctx, id: string): CatalogApp | null {
  return (
    catalogApp(id) ??
    (ctx.config.testTemplates ? (TEST_TEMPLATES.find((t) => t.id === id) ?? null) : null)
  )
}
