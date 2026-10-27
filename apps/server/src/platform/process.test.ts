import { describe, expect, it } from 'vitest'
import { CommandError, run, runChecked } from './process.ts'

describe('run', () => {
  it('streams lines from both outputs, including a last line without a newline', async () => {
    const lines: string[] = []
    const script = 'process.stdout.write("one\\ntwo"); process.stderr.write("oops")'
    const result = await run('node', ['-e', script], {
      onLine: (stream, line) => lines.push(`${stream}:${line}`),
    })
    expect(result.code).toBe(0)
    expect(lines.sort()).toEqual(['stderr:oops', 'stdout:one', 'stdout:two'])
    expect(result.stdout).toBe('')
  })

  it('keeps multi-byte characters intact across chunk boundaries', async () => {
    // Write the bytes of "é" in two separate chunks.
    const script =
      'process.stdout.write(Buffer.from([0xc3])); setTimeout(() => process.stdout.write(Buffer.from([0xa9, 0x0a])), 20)'
    const lines: string[] = []
    await run('node', ['-e', script], { onLine: (_stream, line) => lines.push(line) })
    expect(lines).toEqual(['é'])
  })

  it('captures stdout only when asked', async () => {
    const result = await run('node', ['-e', 'console.log("hi")'], { captureStdout: true })
    expect(result.stdout).toBe('hi\n')
  })

  it('does not pass its own environment to children', async () => {
    process.env.HANGAR_TEST_SECRET = 'leak'
    const result = await run(
      'node',
      ['-e', 'console.log(process.env.HANGAR_TEST_SECRET ?? "none")'],
      {
        captureStdout: true,
      },
    )
    delete process.env.HANGAR_TEST_SECRET
    expect(result.stdout.trim()).toBe('none')
  })

  it('rejects with the output tail on failure', async () => {
    await expect(
      runChecked('node', ['-e', 'console.error("bad thing"); process.exit(3)']),
    ).rejects.toThrow(CommandError)
    await expect(
      runChecked('node', ['-e', 'console.error("bad thing"); process.exit(3)']),
    ).rejects.toThrow(/code 3:\nbad thing/)
  })

  it('kills the command when aborted', async () => {
    const controller = new AbortController()
    const pending = run('node', ['-e', 'setTimeout(() => {}, 60_000)'], {
      signal: controller.signal,
    })
    setTimeout(() => controller.abort('stop'), 50)
    await expect(pending).rejects.toBe('stop')
  })
})
