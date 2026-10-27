import { describe, expect, it } from 'vitest'
import { createCrypto } from './crypto.ts'

const crypto = createCrypto(Buffer.alloc(32, 7))

describe('seal and open', () => {
  it('round-trips a value', () => {
    const envelope = crypto.seal('s3cret value ✓', 'env:p1:API_KEY')
    expect(envelope).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]*$/)
    expect(envelope).not.toContain('s3cret')
    expect(crypto.open(envelope, 'env:p1:API_KEY')).toBe('s3cret value ✓')
  })

  it('round-trips an empty value', () => {
    expect(crypto.open(crypto.seal('', 'a'), 'a')).toBe('')
  })

  it('uses a fresh IV every time', () => {
    expect(crypto.seal('same', 'a')).not.toBe(crypto.seal('same', 'a'))
  })

  it('refuses a value moved to another row', () => {
    const envelope = crypto.seal('value', 'env:p1:A')
    expect(() => crypto.open(envelope, 'env:p1:B')).toThrow()
  })

  it('refuses a tampered value', () => {
    const [v, iv, tag, data] = crypto.seal('value', 'a').split('.')
    const flipped = Buffer.from(data!, 'base64url')
    flipped[0] = flipped[0]! ^ 1
    expect(() => crypto.open([v, iv, tag, flipped.toString('base64url')].join('.'), 'a')).toThrow()
  })

  it('refuses another key', () => {
    const other = createCrypto(Buffer.alloc(32, 8))
    expect(() => other.open(crypto.seal('value', 'a'), 'a')).toThrow()
  })

  it('refuses unknown formats', () => {
    expect(() => crypto.open('v2.a.b.c', 'a')).toThrow('Unrecognized')
    expect(() => crypto.open('plaintext', 'a')).toThrow('Unrecognized')
  })
})
