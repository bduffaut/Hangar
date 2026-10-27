import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isValidGithubSignature } from './signature.ts'

const secret = 'shhh'
const body = Buffer.from('{"ref":"refs/heads/main"}')
const sign = (b: Buffer, s = secret) => `sha256=${createHmac('sha256', s).update(b).digest('hex')}`

describe('isValidGithubSignature', () => {
  it('accepts a correct signature', () => {
    expect(isValidGithubSignature(secret, body, sign(body))).toBe(true)
  })
  it('rejects a missing, malformed, or wrong signature', () => {
    expect(isValidGithubSignature(secret, body, undefined)).toBe(false)
    expect(isValidGithubSignature(secret, body, 'sha1=abc')).toBe(false)
    expect(isValidGithubSignature(secret, body, 'sha256=00')).toBe(false)
    expect(isValidGithubSignature(secret, body, sign(body, 'other'))).toBe(false)
    expect(isValidGithubSignature(secret, Buffer.from('{}'), sign(body))).toBe(false)
  })
})
