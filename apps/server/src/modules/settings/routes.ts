import { contract } from '@hangar/shared'
import { type Http, route } from '../../http/server.ts'
import { connectGithub, setTunnelToken, settingsView, updateSettings } from './service.ts'

export function settingsRoutes(http: Http) {
  const { ctx, access } = http

  route(http, contract.getSettings, () => settingsView(ctx))

  route(http, contract.updateSettings, async ({ body }) => {
    await updateSettings(ctx, body)
    access.invalidate()
    return settingsView(ctx)
  })

  route(http, contract.setGithubToken, ({ body }) => connectGithub(ctx, body.token))

  route(http, contract.setTunnelToken, async ({ body }) => {
    await setTunnelToken(ctx, body.token)
    return settingsView(ctx)
  })
}
