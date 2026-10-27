import { readdir, readFile, statfs } from 'node:fs/promises'
import path from 'node:path'

// Host CPU, memory, disk, temperatures, and battery. Inside a container /proc already reports the
// host's CPU, memory, load, and uptime, / sits on the host's disk, and /sys shows the host's
// sensors, so no host directories are mounted (see HANGAR_HOST_PROC and HANGAR_HOST_SYS).

export interface Temperature {
  name: string
  celsius: number
}

export interface Battery {
  percent: number
  /** As the kernel reports it: Charging, Discharging, Not charging, Full, or Unknown. */
  status: string
}

export interface HostMetrics {
  cpuPercent: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  diskUsedBytes: number
  diskTotalBytes: number
  /** Average number of runnable processes over the last minute. */
  loadAverage: number
  uptimeSeconds: number
  temperatures: Temperature[]
  battery: Battery | null
}

/** What does not change while Hangar runs. */
export interface HostInfo {
  cpuModel: string | null
  cpuThreads: number
  kernel: string | null
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

/** The 1-minute load average from /proc/loadavg. */
export const parseLoadAverage = (loadavg: string) => Number(loadavg.split(/\s+/)[0]) || 0

/** Seconds since boot from /proc/uptime. */
export const parseUptime = (uptime: string) => Math.floor(Number(uptime.split(/\s+/)[0]) || 0)

/** The CPU model name and thread count from /proc/cpuinfo. */
export function parseCpuinfo(cpuinfo: string): { model: string | null; threads: number } {
  const model = /^model name\s*:\s*(.+)$/m.exec(cpuinfo)?.[1] ?? null
  const threads = cpuinfo.match(/^processor\s*:/gm)?.length ?? 0
  return { model: model?.replace(/\s+/g, ' ').trim() ?? null, threads }
}

/** One hwmon chip: its driver name and its sensors' labels with readings in millidegrees. */
export interface HwmonChip {
  name: string
  sensors: { label: string; milli: number }[]
}

// Driver names of the chips worth showing, with the reading that represents each.
const CHIPS: { match: RegExp; name: string; prefer?: RegExp }[] = [
  {
    match: /^(coretemp|k10temp|zenpower|cpu_thermal|soc_thermal)/,
    name: 'CPU',
    prefer: /package|tctl|tdie/i,
  },
  { match: /^(amdgpu|nouveau|radeon)/, name: 'GPU', prefer: /edge/i },
  { match: /^(nvme|drivetemp)/, name: 'SSD', prefer: /composite/i },
  { match: /^pch_/, name: 'Chipset' },
  { match: /^iwlwifi|^ath\d|^mt7/, name: 'Wi-Fi' },
  { match: /^acpitz/, name: 'Board' },
]

/** Picks one reading per kind of chip (CPU first), ignoring sensors that report nothing useful. */
export function pickTemperatures(chips: HwmonChip[]): Temperature[] {
  const found: Temperature[] = []
  for (const kind of CHIPS) {
    const chip = chips.find((c) => kind.match.test(c.name) && c.sensors.length > 0)
    if (!chip || found.some((t) => t.name === kind.name)) continue
    const valid = chip.sensors.filter((s) => s.milli > 0 && s.milli < 150_000)
    const sensor =
      valid.find((s) => kind.prefer?.test(s.label)) ??
      valid.reduce<(typeof valid)[number] | undefined>(
        (a, b) => (!a || b.milli > a.milli ? b : a),
        undefined,
      )
    if (sensor) found.push({ name: kind.name, celsius: Math.round(sensor.milli / 100) / 10 })
  }
  return found
}

const readText = (file: string) => readFile(file, 'utf8').then((text) => text.trim())

async function readHwmon(sysDir: string): Promise<HwmonChip[]> {
  const base = path.join(sysDir, 'class/hwmon')
  const entries = await readdir(base).catch(() => [])
  return Promise.all(
    entries.map(async (entry) => {
      const dir = path.join(base, entry)
      const files = await readdir(dir).catch(() => [])
      const sensors = await Promise.all(
        files
          .filter((f) => /^temp\d+_input$/.test(f))
          .map(async (f) => {
            const prefix = f.replace('_input', '')
            const label = await readText(path.join(dir, `${prefix}_label`)).catch(() => prefix)
            const milli = Number(await readText(path.join(dir, f)).catch(() => 'NaN'))
            return { label, milli }
          }),
      )
      const name = await readText(path.join(dir, 'name')).catch(() => '')
      return { name, sensors: sensors.filter((s) => Number.isFinite(s.milli)) }
    }),
  )
}

async function readBattery(sysDir: string): Promise<Battery | null> {
  const base = path.join(sysDir, 'class/power_supply')
  const supplies = await readdir(base).catch(() => [])
  for (const supply of supplies.filter((s) => s.startsWith('BAT'))) {
    const percent = Number(await readText(path.join(base, supply, 'capacity')).catch(() => 'NaN'))
    if (!Number.isFinite(percent)) continue
    const status = await readText(path.join(base, supply, 'status')).catch(() => 'Unknown')
    return { percent, status }
  }
  return null
}

export function createHostMetrics(options: { procDir: string; rootDir: string; sysDir: string }) {
  let previous: CpuTimes | null = null

  return {
    /** CPU is measured since the previous call, so the first call reports 0. */
    async sample(): Promise<HostMetrics> {
      const [stat, meminfo, disk, loadavg, uptime, chips, battery] = await Promise.all([
        readFile(path.join(options.procDir, 'stat'), 'utf8'),
        readFile(path.join(options.procDir, 'meminfo'), 'utf8'),
        statfs(options.rootDir),
        readFile(path.join(options.procDir, 'loadavg'), 'utf8').catch(() => ''),
        readFile(path.join(options.procDir, 'uptime'), 'utf8').catch(() => ''),
        readHwmon(options.sysDir),
        readBattery(options.sysDir),
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
        loadAverage: parseLoadAverage(loadavg),
        uptimeSeconds: parseUptime(uptime),
        temperatures: pickTemperatures(chips),
        battery,
      }
    },

    async info(): Promise<HostInfo> {
      const [cpuinfo, kernel] = await Promise.all([
        readFile(path.join(options.procDir, 'cpuinfo'), 'utf8').catch(() => ''),
        readText(path.join(options.procDir, 'sys/kernel/osrelease')).catch(() => null),
      ])
      const cpu = parseCpuinfo(cpuinfo)
      return { cpuModel: cpu.model, cpuThreads: cpu.threads, kernel }
    },
  }
}

export type HostMetricsReader = ReturnType<typeof createHostMetrics>
