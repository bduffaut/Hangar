import { contract } from '@hangar/shared'
import { type Http, route } from '../../http/server.ts'
import { health, systemInfo } from './service.ts'

export function systemRoutes(http: Http) {
  const { ctx } = http
  route(http, contract.health, () => health(ctx))
  route(http, contract.systemInfo, () => systemInfo(ctx))
}
