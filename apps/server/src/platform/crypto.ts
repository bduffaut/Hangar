import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Envelope: v1.<iv>.<tag>.<ciphertext>, each part base64url. The version prefix leaves room for
// key rotation. The AAD names where a value is stored (e.g. `env:<projectId>:<key>`), so a
// ciphertext copied into another row fails to decrypt.
const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

export function createCrypto(key: Buffer) {
  if (key.length !== 32) throw new Error('The instance key must be 32 bytes')

  return {
    seal(plaintext: string, aad: string): string {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, key, iv)
      cipher.setAAD(Buffer.from(aad))
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const parts = [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url'))
      return [VERSION, ...parts].join('.')
    },

    open(envelope: string, aad: string): string {
      const [version, iv, tag, ciphertext, ...rest] = envelope.split('.')
      if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
        throw new Error('Unrecognized encrypted value')
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'))
      decipher.setAAD(Buffer.from(aad))
      decipher.setAuthTag(Buffer.from(tag, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}

export type Crypto = ReturnType<typeof createCrypto>
