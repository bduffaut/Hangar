import { type Contract, contract, type EndpointName, errorCopy } from '@hangar/shared'
import type { z } from 'zod'

type Schema<N extends EndpointName, K extends 'params' | 'query' | 'body'> = Contract[N] extends {
  [P in K]: infer S extends z.ZodType
}
  ? z.input<S>
  : never

/** What a call needs: only the parts its endpoint declares. */
export type CallInput<N extends EndpointName> = ([Schema<N, 'params'>] extends [never]
  ? object
  : { params: Schema<N, 'params'> }) &
  ([Schema<N, 'query'>] extends [never] ? object : { query?: Schema<N, 'query'> }) &
  ([Schema<N, 'body'>] extends [never] ? object : { body: Schema<N, 'body'> })

export type CallResult<N extends EndpointName> = z.output<Contract[N]['response']>

/** An error from the API, with its plain-language message and an optional hint. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
  }
}

let csrfToken: string | null = null
const unauthorizedListeners = new Set<() => void>()

/** The session's CSRF token, sent with every request that changes something. */
export function setCsrfToken(token: string | null) {
  csrfToken = token
}

/** Called when a request finds the session has ended. */
export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function buildUrl(path: string, params?: Record<string, unknown>, query?: Record<string, unknown>) {
  const filled = path.replace(/:(\w+)/g, (_, key: string) =>
    encodeURIComponent(String(params?.[key] ?? '')),
  )
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${filled}?${qs}` : filled
}

/** Calls one endpoint of the contract: `api('getProject', { params: { id } })`. */
export async function api<N extends EndpointName>(
  name: N,
  ...[input]: keyof CallInput<N> extends never ? [input?: CallInput<N>] : [input: CallInput<N>]
): Promise<CallResult<N>> {
  const endpoint = contract[name]
  const { params, query, body } = (input ?? {}) as {
    params?: Record<string, unknown>
    query?: Record<string, unknown>
    body?: unknown
  }
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (endpoint.method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken

  let response: Response
  try {
    response = await fetch(buildUrl(endpoint.path, params, query), {
      method: endpoint.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'network', errorCopy.network)
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (payload as { error?: { code: string; message: string; hint?: string } } | null)
      ?.error
    if (response.status === 401 && endpoint.access === 'session') {
      for (const listener of unauthorizedListeners) listener()
    }
    throw new ApiError(
      response.status,
      error?.code ?? 'unexpected',
      error?.message ?? errorCopy.unexpected,
      error?.hint,
    )
  }
  return payload as CallResult<N>
}

/** A message for any thrown value, for toasts and inline errors. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError)
    return error.hint ? `${error.message} ${error.hint}` : error.message
  return errorCopy.unexpected
}
