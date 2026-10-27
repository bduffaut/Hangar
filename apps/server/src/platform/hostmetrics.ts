import { readFile, statfs } from 'node:fs/promises'
import path from 'node:path'

// Host CPU, memory, and disk. Inside a container /proc already reports the host's CPU and memory,
// and / sits on the host's disk, so no host directories are mounted (see HANGAR_HOST_PROC).

export interface HostMetrics {
  cpuPercent: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  diskUsedBytes: number
  diskTotalBytes: number
}

interface CpuTimes {
  idle: number
  total: number
}

/** Parses the aggregate `cpu` line of /proc/stat. */
export function parseCpuTimes(stat: string): CpuTimes {
  const line = stat.split('\n').find((l) => l.startsWith('cpu '))
  if (!line) throw new Error('No cpu line in /proc/stat')
  const values = line.trim().split(/\s+/).slice(1).map(Number)
  // user nice system idle iowait irq softirq steal (guest time is already counted in user)
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] =
    values
  return {
    idle: idle + iowait,
    total: user + nice + system + idle + iowait + irq + softirq + steal,
  }
}

/** MemTotal and MemAvailable from /proc/meminfo, in bytes. */
export function parseMeminfo(meminfo: string): { total: number; available: number } {
  const read = (key: string) => {
    const match = new RegExp(`^${key}:\\s+(\\d+) kB$`, 'm').exec(meminfo)
    return match ? Number(match[1]) * 1024 : 0
  }
  return { total: read('MemTotal'), available: read('MemAvailable') }
}

export function createHostMetrics(options: { procDir: string; rootDir: string }) {
  let previous: CpuTimes | null = null

  return {
    /** CPU is measured since the previous call, so the first call reports 0. */
    async sample(): Promise<HostMetrics> {
      const [stat, meminfo, disk] = await Promise.all([
        readFile(path.join(options.procDir, 'stat'), 'utf8'),
        readFile(path.join(options.procDir, 'meminfo'), 'utf8'),
        statfs(options.rootDir),
      ])
      const cpu = parseCpuTimes(stat)
      const cpuPercent =
        previous && cpu.total > previous.total
          ? (1 - (cpu.idle - previous.idle) / (cpu.total - previous.total)) * 100
          : 0
      previous = cpu
      const memory = parseMeminfo(meminfo)
      return {
        cpuPercent: Math.max(0, Math.min(100, cpuPercent)),
        memoryUsedBytes: memory.total - memory.available,
        memoryTotalBytes: memory.total,
        diskUsedBytes: (disk.blocks - disk.bfree) * disk.bsize,
        diskTotalBytes: disk.blocks * disk.bsize,
      }
    },
  }
}

export type HostMetricsReader = ReturnType<typeof createHostMetrics>
