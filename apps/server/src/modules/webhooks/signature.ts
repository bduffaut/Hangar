import { createHmac, timingSafeEqual } from 'node:crypto'

/** Checks GitHub's `X-Hub-Signature-256` header (`sha256=<hex HMAC of the raw body>`). */
export function isValidGithubSignature(
  secret: string,
  body: Buffer,
  header: string | undefined,
): boolean {
  if (!header?.startsWith('sha256=')) return false
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
