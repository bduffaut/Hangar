import { describe, expect, it } from 'vitest'
import { parseCpuTimes, parseMeminfo } from './hostmetrics.ts'

describe('parseCpuTimes', () => {
  it('sums the aggregate cpu line', () => {
    const stat = 'cpu  100 5 50 800 20 1 2 3 0 0\ncpu0 1 2 3 4 5 6 7 8 0 0\n'
    expect(parseCpuTimes(stat)).toEqual({ idle: 820, total: 981 })
  })
})

describe('parseMeminfo', () => {
  it('reads total and available memory in bytes', () => {
    const meminfo = 'MemTotal:        2048 kB\nMemFree:          100 kB\nMemAvailable:    1024 kB\n'
    expect(parseMeminfo(meminfo)).toEqual({ total: 2048 * 1024, available: 1024 * 1024 })
  })
})
