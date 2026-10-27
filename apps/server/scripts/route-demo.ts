// Stage 1 check: route a hand-started container through the generated Traefik config.
// Usage (inside hangar-core): pnpm route-demo <name> <container> <port>
import { loadConfig } from '../src/config.ts'
import { createDb } from '../src/db/client.ts'
import { getSettings } from '../src/modules/settings/repo.ts'
import {
  appServiceName,
  appUpstreamUrl,
  createProxy,
  renderRouting,
} from '../src/platform/proxy.ts'
import { appHostname } from '@hangar/shared'

const [name, container, portArg] = process.argv.slice(2)
if (!name || !container || !portArg) {
  console.error('Usage: pnpm route-demo <name> <container> <port>')
  process.exit(1)
}

const config = loadConfig(process.env)
const { db, pool } = createDb(config.databaseUrl)
const settings = await getSettings(db)
await pool.end()
if (!settings.lanIp || !settings.lanDomain) throw new Error('LAN address is not configured')

const proxy = createProxy({ dynamicDir: config.traefikDynamicDir, apiUrl: config.traefikApiUrl })
const target = { host: container, port: Number(portArg) }
await proxy.apply(
  renderRouting({
    lanIp: settings.lanIp,
    lanDomain: settings.lanDomain,
    publicDomain: null,
    exposeTowerPublicly: false,
    coreUrl: config.coreUrl,
    apps: [{ name, target }],
  }),
)
await proxy.waitForService(appServiceName(name), appUpstreamUrl(target))
console.log(`Routed: http://${appHostname(name, settings.lanDomain)}`)
