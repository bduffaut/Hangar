import { describe, expect, it } from 'vitest'
import {
  cleanCpuModel,
  deploymentDuration,
  formatBytes,
  formatDuration,
  formatUptime,
  relativeTime,
} from './format.ts'

describe('format', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(512 * 1024 * 1024)).toBe('512 MB')
    expect(formatBytes(3.2 * 1024 ** 3)).toBe('3.2 GB')
  })

  it('formats durations', () => {
    expect(formatDuration(42_000)).toBe('0:42')
    expect(formatDuration(185_000)).toBe('3:05')
    expect(formatDuration(3_730_000)).toBe('1:02:10')
  })

  it('describes relative times', () => {
    const now = Date.parse('2026-10-27T12:00:00Z')
    expect(relativeTime('2026-10-27T11:59:30Z', now)).toBe('just now')
    expect(relativeTime('2026-10-27T11:55:00Z', now)).toBe('5 min ago')
    expect(relativeTime('2026-10-27T09:00:00Z', now)).toBe('3 h ago')
    expect(relativeTime('2026-10-26T12:00:00Z', now)).toBe('1 day ago')
  })

  it('measures deployments', () => {
    expect(deploymentDuration({ startedAt: null, finishedAt: null })).toBeNull()
    expect(
      deploymentDuration({ startedAt: '2026-10-27T12:00:00Z', finishedAt: '2026-10-27T12:01:30Z' }),
    ).toBe(90_000)
  })

  it('formats uptime and CPU names', () => {
    expect(formatUptime(45 * 60)).toBe('45 min')
    expect(formatUptime(6 * 3600 + 12 * 60)).toBe('6 h 12 min')
    expect(formatUptime(3 * 86400 + 4 * 3600)).toBe('3 days 4 h')
    expect(cleanCpuModel('Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz')).toBe(
      'Intel Core i7-9750H @ 2.60GHz',
    )
  })
})
