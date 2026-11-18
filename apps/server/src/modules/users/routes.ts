import { contract } from '@hangar/shared'
import { clearSessionCookie, type Http, OK, route } from '../../http/server.ts'
import {
  changeRole,
  createInvite,
  createResetLink,
  inviteViews,
  removeOwnAccount,
  removeUser,
  revokeInvite,
  userViews,
} from './service.ts'

/** Everything here but deleting your own account needs the admin role (`route` enforces it). */
export function userRoutes(http: Http) {
  const { ctx } = http

  route(http, contract.deleteAccount, async ({ auth, body, request, reply }) => {
    await removeOwnAccount(ctx, auth.user.id, body.confirm)
    clearSessionCookie(request, reply)
    return OK
  })

  route(http, contract.listUsers, () => userViews(ctx))
  route(http, contract.updateUser, ({ params, body }) => changeRole(ctx, params.id, body.role))
  route(http, contract.deleteUser, async ({ auth, params }) => {
    await removeUser(ctx, auth.user.id, params.id)
    return OK
  })
  route(http, contract.createResetLink, ({ auth, params }) =>
    createResetLink(ctx, auth.user.id, params.id),
  )

  route(http, contract.listInvites, () => inviteViews(ctx))
  route(http, contract.createInvite, ({ auth, body }) => createInvite(ctx, auth.user.id, body))
  route(http, contract.revokeInvite, async ({ params }) => {
    await revokeInvite(ctx, params.id)
    return OK
  })
}
