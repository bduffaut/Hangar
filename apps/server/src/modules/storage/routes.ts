import { contract } from '@hangar/shared'
import { type Http, OK, route } from '../../http/server.ts'
import { ownedProject } from '../projects/service.ts'
import {
  createLibrary,
  deleteLibrary,
  deleteOrphanVolume,
  libraryList,
  storageView,
  updateLibrary,
  volumeList,
} from './service.ts'

export function storageRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.projectStorage, async ({ auth, params }) =>
    storageView(ctx, await ownedProject(ctx, auth.user.id, params.id)),
  )

  route(http, contract.listLibraries, () => libraryList(ctx))
  // Each check starts a short-lived container, so a few a minute is plenty.
  route(http, contract.createLibrary, ({ body }) => createLibrary(ctx, body), { rateLimit: 20 })
  route(http, contract.updateLibrary, ({ params, body }) => updateLibrary(ctx, params.id, body))
  route(http, contract.deleteLibrary, async ({ params }) => {
    await deleteLibrary(ctx, params.id)
    return OK
  })

  route(http, contract.listVolumes, () => volumeList(ctx))
  route(http, contract.deleteVolume, async ({ params }) => {
    await deleteOrphanVolume(ctx, params.name)
    return OK
  })
}
