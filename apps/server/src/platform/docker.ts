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
} as const

export const TUNNEL_CONTAINER = 'hangar-tunnel'

export interface AppContainerSpec {
  name: string
  image: string
  projectId: string
  deploymentId: string
  env: Record<string, string>
  memoryLimitMb: number
  network: string
}

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

  const api = {
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
          NetworkMode: spec.network,
          RestartPolicy: { Name: 'unless-stopped' },
          CapDrop: APP_DROPPED_CAPABILITIES,
          SecurityOpt: ['no-new-privileges'],
          Memory: spec.memoryLimitMb * 1024 * 1024,
          // A runaway app (fork loop, busy loop) must not starve the database or Hangar itself:
          // cap its processes, and give it half the default CPU weight when the CPU is contended.
          PidsLimit: APP_PIDS_LIMIT,
          CpuShares: APP_CPU_SHARES,
          LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
        },
      })
      await container.start()
      return container.id
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

    /** Total size of Hangar's app images (`hangar/*`). */
    async imageDiskUsage(): Promise<number> {
      const images = await docker.listImages({ filters: { reference: ['hangar/*'] } })
      return images.reduce((sum, image) => sum + image.Size, 0)
    },
  }
  return api

  async function listManaged(
    kind: 'app' | 'tunnel',
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
