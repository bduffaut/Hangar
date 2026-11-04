import { contract } from '@hangar/shared'
import { type Http, route } from '../../http/server.ts'
import { checkAddress } from './reachability.ts'
import { connectGithub, setTunnelToken, settingsView, updateSettings } from './service.ts'

export function settingsRoutes(http: Http) {
  const { ctx, access } = http

  route(http, contract.getSettings, ({ auth }) => settingsView(ctx, auth.user.id))

  route(http, contract.updateSettings, async ({ auth, body }) => {
    await updateSettings(ctx, body)
    access.invalidate()
    return settingsView(ctx, auth.user.id)
  })

  route(http, contract.setGithubToken, ({ auth, body }) =>
    connectGithub(ctx, auth.user.id, body.token),
  )

  // Each check makes one request over the internet; a few a minute is plenty for a person.
  route(http, contract.checkAddress, ({ body }) => checkAddress(ctx, body), { rateLimit: 30 })

  route(http, contract.setTunnelToken, async ({ auth, body }) => {
    await setTunnelToken(ctx, body.token)
    return settingsView(ctx, auth.user.id)
  })
}
