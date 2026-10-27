import { describe, expect, it } from 'vitest'
import { parseAnsi } from './ansi.ts'

describe('parseAnsi', () => {
  it('passes plain lines through', () => {
    expect(parseAnsi('hello')).toEqual([{ text: 'hello', classes: [] }])
  })

  it('maps colors to fixed classes', () => {
    const segments = parseAnsi('\u001b[31merror\u001b[0m done')
    expect(segments[0]).toEqual({ text: 'error', classes: ['ansi-fg-red'] })
    expect(segments[1]?.text).toBe(' done')
  })

  it('keeps markup as plain text', () => {
    expect(parseAnsi('\u001b[32m<script>x</script>')[0]?.text).toBe('<script>x</script>')
  })
})
