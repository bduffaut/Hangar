import { schemas } from '@hangar/shared'
import { describe, expect, it } from 'vitest'
import { UserError } from '../errors.ts'
import { parseInput } from './server.ts'

function problemWith(schema: Parameters<typeof parseInput>[0], value: unknown) {
  try {
    parseInput(schema, value)
  } catch (error) {
    if (error instanceof UserError) return { status: error.status, message: error.message }
    throw error
  }
  throw new Error('Expected the input to be rejected')
}

describe('parseInput', () => {
  it('explains a typed field in a plain sentence, without the field name', () => {
    const body = { setupCode: 'ABCD', username: 'admin', password: 'short' }
    expect(problemWith(schemas.setupComplete, body)).toEqual({
      status: 400,
      message: 'Passwords must be at least 10 characters.',
    })
  })

  it.each([
    [schemas.settingsPatch, { lanIp: '300.1.1.1' }, 'IPv4'],
    [schemas.projectInput, { name: 'a', repoUrl: 'x', port: 0 }, 'port'],
    [schemas.projectInput, { name: 'a', repoUrl: 'x', memoryLimitMb: 10 }, 'memory limit'],
    [schemas.envReplace, { vars: { '1ABC': 'x' } }, 'Variable names'],
    [
      schemas.setupComplete,
      { setupCode: '', username: 'admin', password: 'long enough' },
      'setup code',
    ],
  ])('gives a plain message for %#', (schema, value, expected) => {
    const { message } = problemWith(schema, value)
    expect(message).toContain(expected)
    expect(message).not.toMatch(/too (small|big)|expected|invalid input/i)
  })

  it('falls back to a general message for fields nobody types', () => {
    expect(problemWith(schemas.idParams, { id: 'nope' }).message).toBe(
      'Some of the details sent were not valid. Reload the page and try again.',
    )
  })
})
