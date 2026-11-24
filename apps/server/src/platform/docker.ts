import { PassThrough, type Readable } from 'node:stream'
import Dockerode from 'dockerode'

/**
 * The tunnel's network, shared with Traefik and core. Each account's apps and builds get a network
 * of their own (see `ensureAppNetwork`), so they cannot connect to the database or directly to
 * another account's containers. Traefik remains a way to reach any routed app, like any visitor.
 */
export const APP_NETWORK = 'hangar-apps'
const APP_PIDS_LIMIT = 4096
const APP_CPU_SHARES = 512
// Docker's defaults minus what a web app never needs: raw sockets (spoofing, ARP tricks on the
// bridge), device nodes, and writing to the audit log. Apps cannot gain privileges with setuid.
const APP_DROPPED_CAPABILITIES = ['NET_RAW', 'MKNOD', 'AUDIT_WRITE', 'SETFCAP']

// Every container Hangar creates carries these labels; cleanup finds containers by label, never by name.
export const LABELS = {
  managed: 'hangar.managed',
  kind: 'hangar.kind',
  project: 'hangar.project',
  deployment: 'hangar.deployment',
  /** On a network: the account whose apps run on it. */
  owner: 'hangar.owner',
  /** On the tunnel container: a hash of the token it runs with, to detect a changed token. */
  tunnelToken: 'hangar.tunnel-token',
  /** On a data volume: the app it was made for (by name), kept after the app is deleted. */
  app: 'hangar.app',
  /** On a stack service container (D44): its service name, and a hash of how it was made. */
  service: 'hangar.service',
  serviceSpec: 'hangar.service-spec',
} as const

/** One mount of an app container: a Hangar volume, or a library folder from the computer. */
export interface AppMount {
  type: 'volume' | 'bind'
  source: string
  target: string
  readOnly: boolean
}

export interface DataVolume {
  name: string
  /** The app it was made for, and the account that owned it. */
  app: string | null
  ownerId: string | null
}

export const TUNNEL_CONTAINER = 'hangar-tunnel'

export interface AppContainerSpec {
  name: string
  image: string
  projectId: string
  deploymentId: string
  env: Record<string, string>
  memoryLimitMb: number
  network: string
  mounts?: AppMount[]
  /** Pass /dev/dri (the graphics chip) through. */
  gpu?: boolean
  /** More networks to join, such as the app's private stack network. */
  extraNetworks?: string[]
}

/** A supporting container of a stack (D44): never routed, only on its stack's network. */
export interface ServiceContainerSpec {
  name: string
  image: string
  projectId: string
  service: string
  /** A hash of image, env, and mounts: a different hash means the container must be replaced. */
  specHash: string
  env: Record<string, string>
  memoryLimitMb: number
  network: string
  mounts: AppMount[]
  healthCommand?: string
  shmSizeMb?: number
}

/** Docker's view of a container's health: `none` when it has no health check. */
export type ContainerHealth = 'starting' | 'healthy' | 'unhealthy' | 'none'

export interface ManagedContainer {
  id: string
  name: string
  projectId: string | null
  deploymentId: string | null
  running: boolean
  labels: Record<string, string>
}

export interface ContainerStats {
  cpuPercent: number
  memoryUsedBytes: number
}

export interface ContainerState {
  running: boolean
  restarting: boolean
  /** Restarts by the restart policy; above zero means the app has crashed at least once. */
  restartCount: number
  exitCode: number
}

const isNotFound = (error: unknown) => (error as { statusCode?: number }).statusCode === 404

/** Docker multiplexes stdout and stderr into frames: 1 byte stream, 3 padding, 4 bytes length. */
function demuxLogs(buffer: Buffer): string {
  let out = ''
  let offset = 0
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4)
    out += buffer.subarray(offset + 8, offset + 8 + size).toString('utf8')
    offset += 8 + size
  }
  return out
}

export function createDocker(docker = new Dockerode()) {
  async function inspectContainer(idOrName: string) {
    try {
      return await docker.getContainer(idOrName).inspect()
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  /** Limits shared by apps and stack services: memory, processes, CPU weight, capabilities. */
  function appHostConfig(spec: { network: string; memoryLimitMb: number; mounts?: AppMount[] }) {
    return {
      NetworkMode: spec.network,
      RestartPolicy: { Name: 'unless-stopped' },
      CapDrop: APP_DROPPED_CAPABILITIES,
      SecurityOpt: ['no-new-privileges'],
      Memory: spec.memoryLimitMb * 1024 * 1024,
      // Volumes and library folders. A bind source must already exist: Docker refuses a
      // missing folder instead of creating it as root (the Mounts API, not -v).
      Mounts: (spec.mounts ?? []).map((m) => ({
        Type: m.type,
        Source: m.source,
        Target: m.target,
        ReadOnly: m.readOnly,
        ...(m.type === 'bind' ? { BindOptions: { Propagation: 'rprivate' as const } } : {}),
      })),
      // A runaway app (fork loop, busy loop) must not starve the database or Hangar itself:
      // cap its processes, and give it half the default CPU weight when the CPU is contended.
      PidsLimit: APP_PIDS_LIMIT,
      CpuShares: APP_CPU_SHARES,
      LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
    }
  }

  const api = {
    /** The machine Docker runs on (not this container): its name and operating system. */
    async hostInfo() {
      const info = (await docker.info()) as { Name?: string; OperatingSystem?: string }
      return { hostname: info.Name ?? null, os: info.OperatingSystem ?? null }
    },

    async imageExists(ref: string): Promise<boolean> {
      try {
        await docker.getImage(ref).inspect()
        return true
      } catch (error) {
        if (isNotFound(error)) return false
        throw error
      }
    },

    async exposedPorts(ref: string): Promise<number[]> {
      const image = await docker.getImage(ref).inspect()
      return Object.keys(image.Config.ExposedPorts ?? {})
        .filter((key) => key.endsWith('/tcp'))
        .map((key) => Number.parseInt(key, 10))
        .filter((port) => Number.isInteger(port))
    },

    /**
     * The image's own health check command (its `HEALTHCHECK`), as the argv to run inside the
     * container: `CMD-SHELL` becomes `/bin/sh -c`. Null for none or `HEALTHCHECK NONE`.
     */
    async imageHealthCheck(ref: string): Promise<string[] | null> {
      const image = await docker.getImage(ref).inspect()
      const test = (image.Config as { Healthcheck?: { Test?: string[] } }).Healthcheck?.Test
      if (!test?.length) return null
      if (test[0] === 'CMD-SHELL' && test[1]) return ['/bin/sh', '-c', test[1]]
      if (test[0] === 'CMD' && test.length > 1) return test.slice(1)
      return null
    },

    /**
     * Runs a command once inside a running container, as its own user, and returns its exit code
     * and the end of its output. A command still running after `timeoutMs` counts as failed.
     */
    async execOnce(
      idOrName: string,
      cmd: string[],
      timeoutMs: number,
    ): Promise<{ exitCode: number; output: string }> {
      const exec = await docker.getContainer(idOrName).exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      })
      const stream = await exec.start({ hijack: true, stdin: false })
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      const finished = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs)
        stream.on('end', () => {
          clearTimeout(timer)
          resolve(true)
        })
        stream.on('error', () => {
          clearTimeout(timer)
          resolve(false)
        })
      })
      if (!finished) stream.destroy()
      const info = await exec.inspect()
      const output = demuxLogs(Buffer.concat(chunks)).trim().slice(-500)
      return { exitCode: finished ? (info.ExitCode ?? 1) : 124, output }
    },

    /** Every tag of Hangar's app images (`hangar/*:*`). */
    async listAppImageTags(): Promise<string[]> {
      const images = await docker.listImages({ filters: { reference: ['hangar/*'] } })
      return images
        .flatMap((image) => image.RepoTags ?? [])
        .filter((tag) => tag.startsWith('hangar/'))
    },

    /** Image tags in a repository, e.g. every `hangar/blog:*`. */
    async listTags(repository: string): Promise<string[]> {
      const images = await docker.listImages({ filters: { reference: [`${repository}:*`] } })
      return images
        .flatMap((image) => image.RepoTags ?? [])
        .filter((tag) => tag.startsWith(`${repository}:`))
    },

    async removeImage(ref: string): Promise<void> {
      try {
        await docker.getImage(ref).remove()
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },

    /**
     * Creates an account's app network if needed and attaches `peers` (Traefik and core) to it.
     * Safe to repeat: a recreated proxy loses these attachments, and this puts them back.
     */
    async ensureAppNetwork(name: string, ownerId: string, peers: string[]): Promise<void> {
      const network = docker.getNetwork(name)
      const info = await network.inspect().catch(async (error: unknown) => {
        if (!isNotFound(error)) throw error
        await docker.createNetwork({
          Name: name,
          Driver: 'bridge',
          Labels: { [LABELS.managed]: 'true', [LABELS.owner]: ownerId },
        })
        return (await network.inspect()) as { Containers?: Record<string, { Name: string }> }
      })
      const attached = Object.values(
        (info as { Containers?: Record<string, { Name: string }> }).Containers ?? {},
      ).map((container) => container.Name)
      for (const peer of peers) {
        if (attached.includes(peer)) continue
        await network.connect({ Container: peer }).catch((error: unknown) => {
          // Not a container here (development and tests), or attached a moment ago.
          const status = (error as { statusCode?: number }).statusCode
          if (status !== 404 && status !== 403) throw error
        })
      }
    },

    /** Removes an account's network, detaching the peers first. Missing networks are ignored. */
    async removeAppNetwork(name: string): Promise<void> {
      const network = docker.getNetwork(name)
      try {
        const info = (await network.inspect()) as { Containers?: Record<string, { Name: string }> }
        for (const container of Object.values(info.Containers ?? {})) {
          await network.disconnect({ Container: container.Name, Force: true })
        }
        await network.remove()
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },

    /** Creates and starts an app container on its network. Replaces a leftover with the same name. */
    async runApp(spec: AppContainerSpec): Promise<string> {
      const leftover = await inspectContainer(spec.name)
      if (leftover) await docker.getContainer(leftover.Id).remove({ force: true, v: true })

      const container = await docker.createContainer({
        name: spec.name,
        Image: spec.image,
        Env: Object.entries(spec.env).map(([key, value]) => `${key}=${value}`),
        Labels: {
          [LABELS.managed]: 'true',
          [LABELS.kind]: 'app',
          [LABELS.project]: spec.projectId,
          [LABELS.deployment]: spec.deploymentId,
        },
        HostConfig: {
          ...appHostConfig(spec),
          Devices: spec.gpu
            ? [{ PathOnHost: '/dev/dri', PathInContainer: '/dev/dri', CgroupPermissions: 'rwm' }]
            : [],
        },
      })
      for (const network of spec.extraNetworks ?? []) {
        await docker.getNetwork(network).connect({ Container: container.id })
      }
      await container.start()
      return container.id
    },

    /**
     * Creates and starts a stack service (D44) with the same limits as an app, reachable on its
     * stack network at its service name. Replaces a leftover with the same name.
     */
    async runService(spec: ServiceContainerSpec): Promise<string> {
      const leftover = await inspectContainer(spec.name)
      if (leftover) await docker.getContainer(leftover.Id).remove({ force: true, v: true })
      const container = await docker.createContainer({
        name: spec.name,
        Image: spec.image,
        Env: Object.entries(spec.env).map(([key, value]) => `${key}=${value}`),
        Labels: {
          [LABELS.managed]: 'true',
          [LABELS.kind]: 'service',
          [LABELS.project]: spec.projectId,
          [LABELS.service]: spec.service,
          [LABELS.serviceSpec]: spec.specHash,
        },
        ...(spec.healthCommand
          ? {
              Healthcheck: {
                Test: ['CMD-SHELL', spec.healthCommand],
                Interval: 5e9,
                Timeout: 5e9,
                Retries: 5,
                StartPeriod: 10e9,
              },
            }
          : {}),
        HostConfig: {
          ...appHostConfig(spec),
          ...(spec.shmSizeMb ? { ShmSize: spec.shmSizeMb * 1024 * 1024 } : {}),
        },
        NetworkingConfig: { EndpointsConfig: { [spec.network]: { Aliases: [spec.service] } } },
      })
      await container.start()
      return container.id
    },

    /** A container's health, its image's spec hash label, and whether it runs; null if missing. */
    async serviceState(
      name: string,
    ): Promise<{ running: boolean; health: ContainerHealth; specHash: string | null } | null> {
      const info = await inspectContainer(name)
      if (!info) return null
      return {
        running: info.State.Running,
        health: (info.State.Health?.Status as ContainerHealth | undefined) ?? 'none',
        specHash: info.Config.Labels?.[LABELS.serviceSpec] ?? null,
      }
    },

    /** Creates a stack's private network if needed. Only the stack's own containers join it. */
    async ensureStackNetwork(name: string, projectId: string): Promise<void> {
      const network = docker.getNetwork(name)
      await network.inspect().catch(async (error: unknown) => {
        if (!isNotFound(error)) throw error
        await docker.createNetwork({
          Name: name,
          Driver: 'bridge',
          Internal: false,
          Labels: { [LABELS.managed]: 'true', [LABELS.project]: projectId },
        })
      })
    },

    async containerState(idOrName: string): Promise<ContainerState | null> {
      const info = await inspectContainer(idOrName)
      if (!info) return null
      return {
        running: info.State.Running,
        restarting: info.State.Restarting,
        restartCount: info.RestartCount,
        exitCode: info.State.ExitCode,
      }
    },

    async startContainer(idOrName: string): Promise<void> {
      await docker.getContainer(idOrName).start()
    },

    async stopContainer(idOrName: string, graceSeconds: number): Promise<void> {
      try {
        await docker.getContainer(idOrName).stop({ t: graceSeconds })
      } catch (error) {
        // 304: already stopped.
        if (!isNotFound(error) && (error as { statusCode?: number }).statusCode !== 304) throw error
      }
    },

    /** Stops with a grace period, then removes. Missing containers are ignored. */
    async removeContainer(idOrName: string, graceSeconds = 0): Promise<void> {
      try {
        const container = docker.getContainer(idOrName)
        if (graceSeconds > 0) await container.stop({ t: graceSeconds }).catch(() => {})
        await container.remove({ force: true, v: true })
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },

    async containerLogTail(idOrName: string, lines: number): Promise<string[]> {
      try {
        const output = await docker
          .getContainer(idOrName)
          .logs({ stdout: true, stderr: true, tail: lines, follow: false })
        return demuxLogs(output).split(/\r?\n/).filter(Boolean)
      } catch (error) {
        if (isNotFound(error)) return []
        throw error
      }
    },

    listManagedApps: (projectId?: string) => listManaged('app', projectId),
    listManagedServices: (projectId?: string) => listManaged('service', projectId),
    listTunnels: () => listManaged('tunnel'),

    /** Pulls an image if it is not present yet. */
    async ensureImage(ref: string): Promise<void> {
      if (await api.imageExists(ref)) return
      const stream = await docker.pull(ref)
      await new Promise<void>((resolve, reject) =>
        docker.modem.followProgress(stream, (error) => (error ? reject(error) : resolve())),
      )
    },

    /** Starts cloudflared with the tunnel token in its environment (never on its command line). */
    async runTunnel(spec: { image: string; token: string; tokenHash: string }): Promise<void> {
      await api.removeContainer(TUNNEL_CONTAINER)
      const container = await docker.createContainer({
        name: TUNNEL_CONTAINER,
        Image: spec.image,
        Cmd: ['tunnel', '--no-autoupdate', 'run'],
        Env: [`TUNNEL_TOKEN=${spec.token}`],
        Labels: {
          [LABELS.managed]: 'true',
          [LABELS.kind]: 'tunnel',
          [LABELS.tunnelToken]: spec.tokenHash,
        },
        HostConfig: {
          NetworkMode: APP_NETWORK,
          RestartPolicy: { Name: 'unless-stopped' },
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
        },
      })
      await container.start()
    },

    async restartContainer(idOrName: string, graceSeconds: number): Promise<void> {
      await docker.getContainer(idOrName).restart({ t: graceSeconds })
    },

    /**
     * Follows a container's output, starting with the last `tail` lines. Returns a text stream of
     * stdout and stderr combined; destroy it (or abort `signal`) to stop following.
     */
    async followLogs(idOrName: string, tail: number, signal: AbortSignal): Promise<Readable> {
      const container = docker.getContainer(idOrName)
      const raw = (await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail,
        abortSignal: signal,
      })) as unknown as Readable
      const out = new PassThrough()
      docker.modem.demuxStream(raw, out, out)
      raw.on('end', () => out.end())
      raw.on('error', (error) => out.destroy(error))
      signal.addEventListener('abort', () => raw.destroy(), { once: true })
      return out
    },

    async containerStats(idOrName: string): Promise<ContainerStats | null> {
      try {
        const stats = await docker.getContainer(idOrName).stats({ stream: false })
        const cpuDelta =
          stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
        const systemDelta =
          (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0)
        const cpus = stats.cpu_stats.online_cpus ?? 1
        const cache =
          (stats.memory_stats.stats as { inactive_file?: number } | undefined)?.inactive_file ?? 0
        return {
          cpuPercent: systemDelta > 0 ? (cpuDelta / systemDelta) * cpus * 100 : 0,
          memoryUsedBytes: Math.max(0, (stats.memory_stats.usage ?? 0) - cache),
        }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    /**
     * Pulls `ref` and returns the image's ID. Progress goes to `onLine` once per layer step, not
     * once per byte. `signal` aborts the pull.
     */
    async pullImage(
      ref: string,
      onLine: (line: string) => void,
      signal: AbortSignal,
    ): Promise<string> {
      const stream = (await docker.pull(ref, { abortSignal: signal })) as NodeJS.ReadableStream
      const seen = new Map<string, string>()
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new Error('aborted'))
        signal.addEventListener('abort', abort, { once: true })
        docker.modem.followProgress(
          stream,
          (error) => {
            signal.removeEventListener('abort', abort)
            if (error) reject(error)
            else resolve()
          },
          (event: { id?: string; status?: string; error?: string }) => {
            if (event.error) return onLine(event.error)
            if (!event.status) return
            // "Downloading" and "Extracting" repeat with byte counts: report each step once.
            if (event.id && seen.get(event.id) === event.status) return
            if (event.id) seen.set(event.id, event.status)
            onLine(event.id ? `${event.id}: ${event.status}` : event.status)
          },
        )
      })
      const image = await docker.getImage(ref).inspect()
      return image.Id
    },

    /** Adds `target` (repository:tag) as another name of an image. */
    async tagImage(source: string, target: string): Promise<void> {
      const colon = target.lastIndexOf(':')
      await docker
        .getImage(source)
        .tag({ repo: target.slice(0, colon), tag: target.slice(colon + 1) })
    },

    /** Removes one name of an image, leaving the image while other names use it. */
    async untagImage(ref: string): Promise<void> {
      try {
        await docker.getImage(ref).remove({ noprune: true })
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },

    /**
     * Makes sure an app's data volume exists. A volume left by a deleted app of the same name is
     * reused only by the same account; anyone else's is refused (`false`), so no one inherits
     * another account's data by choosing its old name.
     */
    async ensureDataVolume(name: string, app: string, ownerId: string): Promise<boolean> {
      const existing = await docker
        .getVolume(name)
        .inspect()
        .catch((error: unknown) => {
          if (isNotFound(error)) return null
          throw error
        })
      if (existing) return existing.Labels?.[LABELS.owner] === ownerId
      await docker.createVolume({
        Name: name,
        Labels: {
          [LABELS.managed]: 'true',
          [LABELS.kind]: 'data',
          [LABELS.app]: app,
          [LABELS.owner]: ownerId,
        },
      })
      return true
    },

    async listDataVolumes(): Promise<DataVolume[]> {
      const { Volumes } = await docker.listVolumes({
        filters: { label: [`${LABELS.managed}=true`, `${LABELS.kind}=data`] },
      })
      return (Volumes ?? []).map((v) => ({
        name: v.Name,
        app: v.Labels?.[LABELS.app] ?? null,
        ownerId: v.Labels?.[LABELS.owner] ?? null,
      }))
    },

    async removeVolume(name: string): Promise<void> {
      try {
        await docker.getVolume(name).remove()
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },

    /**
     * The size of each data volume, from Docker's disk usage report. That report walks every
     * volume, so callers cache it (see modules/storage).
     */
    async dataVolumeSizes(): Promise<Map<string, number>> {
      const usage = (await docker.df()) as {
        Volumes?: { Name: string; Labels?: Record<string, string>; UsageData?: { Size: number } }[]
      }
      const sizes = new Map<string, number>()
      for (const v of usage.Volumes ?? []) {
        if (v.Labels?.[LABELS.kind] !== 'data') continue
        if (v.UsageData && v.UsageData.Size >= 0) sizes.set(v.Name, v.UsageData.Size)
      }
      return sizes
    },

    /**
     * Runs a short command in a throwaway container with no network, no capabilities, and a
     * read-only root, and returns its exit code and output. Used to look at the computer's
     * folders without giving core itself access to them.
     */
    async runProbe(spec: {
      image: string
      cmd: string[]
      binds: string[]
    }): Promise<{ exitCode: number; output: string }> {
      const container = await docker.createContainer({
        Image: spec.image,
        Entrypoint: [],
        Cmd: spec.cmd,
        User: '0:0',
        Labels: { [LABELS.managed]: 'true', [LABELS.kind]: 'probe' },
        HostConfig: {
          Binds: spec.binds,
          NetworkMode: 'none',
          // Only reading: DAC_READ_SEARCH lets it look into folders other users locked (a home
          // folder is usually 750), on a mount that is read-only anyway.
          CapDrop: ['ALL'],
          CapAdd: ['DAC_READ_SEARCH'],
          SecurityOpt: ['no-new-privileges'],
          ReadonlyRootfs: true,
          Memory: 64 * 1024 * 1024,
          PidsLimit: 64,
        },
      })
      try {
        await container.start()
        const { StatusCode } = (await container.wait()) as { StatusCode: number }
        const output = await container.logs({ stdout: true, stderr: true, follow: false })
        return { exitCode: StatusCode, output: demuxLogs(output).trim() }
      } finally {
        await container.remove({ force: true }).catch(() => {})
      }
    },

    /** The image a running container was created from (core's own, for probes). */
    async containerImage(idOrName: string): Promise<string | null> {
      const info = await inspectContainer(idOrName)
      return info?.Image ?? null
    },

    /** Total size of Hangar's app images (`hangar/*`). */
    async imageDiskUsage(): Promise<number> {
      const images = await docker.listImages({ filters: { reference: ['hangar/*'] } })
      return images.reduce((sum, image) => sum + image.Size, 0)
    },
  }
  return api

  async function listManaged(
    kind: 'app' | 'service' | 'tunnel',
    projectId?: string,
  ): Promise<ManagedContainer[]> {
    const label = [`${LABELS.managed}=true`, `${LABELS.kind}=${kind}`]
    if (projectId) label.push(`${LABELS.project}=${projectId}`)
    const containers = await docker.listContainers({ all: true, filters: { label } })
    return containers.map((c) => ({
      id: c.Id,
      name: (c.Names[0] ?? '').replace(/^\//, ''),
      projectId: c.Labels[LABELS.project] ?? null,
      deploymentId: c.Labels[LABELS.deployment] ?? null,
      running: c.State === 'running',
      labels: c.Labels,
    }))
  }
}

export type Docker = ReturnType<typeof createDocker>
