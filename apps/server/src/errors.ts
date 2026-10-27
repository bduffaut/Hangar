/**
 * An error the user can act on. Its message is shown as-is, so it must be plain language and must
 * not contain secrets. Anything else that escapes a handler becomes a generic 500.
 */
export class UserError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
  }
}

export const badRequest = (code: string, message: string, hint?: string) =>
  new UserError(400, code, message, hint)
export const notFound = (what: string) => new UserError(404, 'not_found', `${what} not found`)
export const conflict = (code: string, message: string, hint?: string) =>
  new UserError(409, code, message, hint)
