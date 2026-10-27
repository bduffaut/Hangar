import { describe, expect, it } from 'vitest'
import {
  parseCpuinfo,
  parseCpuTimes,
  parseLoadAverage,
  parseMeminfo,
  parseUptime,
  pickTemperatures,
} from './hostmetrics.ts'

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

describe('pickTemperatures', () => {
  it('picks one reading per kind of sensor, preferring the CPU package', () => {
    // As read from a real laptop's /sys/class/hwmon.
    const chips = [
      { name: 'ADP1', sensors: [] },
      { name: 'acpitz_0', sensors: [{ label: 'temp1', milli: 39000 }] },
      {
        name: 'nvme',
        sensors: [
          { label: 'Composite', milli: 32850 },
          { label: 'Sensor 2', milli: 40000 },
        ],
      },
      { name: 'pch_cannonlake_1', sensors: [{ label: 'temp1', milli: 43000 }] },
      {
        name: 'coretemp',
        sensors: [
          { label: 'Core 0', milli: 61000 },
          { label: 'Package id 0', milli: 59000 },
        ],
      },
    ]
    expect(pickTemperatures(chips)).toEqual([
      { name: 'CPU', celsius: 59 },
      { name: 'SSD', celsius: 32.9 },
      { name: 'Chipset', celsius: 43 },
      { name: 'Board', celsius: 39 },
    ])
  })

  it('falls back to the hottest sensor and ignores impossible readings', () => {
    const chips = [
      {
        name: 'k10temp',
        sensors: [
          { label: 'temp1', milli: 0 },
          { label: 'temp2', milli: 70500 },
        ],
      },
    ]
    expect(pickTemperatures(chips)).toEqual([{ name: 'CPU', celsius: 70.5 }])
    expect(pickTemperatures([])).toEqual([])
  })
})

describe('other /proc files', () => {
  it('reads load, uptime, and the CPU model', () => {
    expect(parseLoadAverage('0.52 0.40 0.31 2/811 12345\n')).toBe(0.52)
    expect(parseUptime('350735.47 2738472.20\n')).toBe(350735)
    const cpuinfo =
      'processor\t: 0\nmodel name\t: Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz\n\nprocessor\t: 1\nmodel name\t: Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz\n'
    expect(parseCpuinfo(cpuinfo)).toEqual({
      model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz',
      threads: 2,
    })
  })
})
