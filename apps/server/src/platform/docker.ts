import Dockerode from 'dockerode'

const HANGAR_NETWORK = 'hangar'

// Every container Hangar creates carries these labels; cleanup finds containers by label, never by name.
export const LABELS = {
  managed: 'hangar.managed',
  kind: 'hangar.kind',
  project: 'hangar.project',
  deployment: 'hangar.deployment',
} as const

export interface AppContainerSpec {
  name: string
  image: string
  projectId: string
  deploymentId: string
  env: Record<string, string>
  memoryLimitMb: number
}

export interface ManagedContainer {
  id: string
  name: string
  projectId: string | null
  deploymentId: string | null
  running: boolean
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

  return {
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

    /** Creates and starts an app container on the hangar network. Replaces a leftover with the same name. */
    async runApp(spec: AppContainerSpec): Promise<string> {
      const leftover = await inspectContainer(spec.name)
      if (leftover) await docker.getContainer(leftover.Id).remove({ force: true })

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
          NetworkMode: HANGAR_NETWORK,
          RestartPolicy: { Name: 'unless-stopped' },
          Memory: spec.memoryLimitMb * 1024 * 1024,
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
        await container.remove({ force: true })
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

    async listManagedApps(projectId?: string): Promise<ManagedContainer[]> {
      const label = [`${LABELS.managed}=true`, `${LABELS.kind}=app`]
      if (projectId) label.push(`${LABELS.project}=${projectId}`)
      const containers = await docker.listContainers({ all: true, filters: { label } })
      return containers.map((c) => ({
        id: c.Id,
        name: (c.Names[0] ?? '').replace(/^\//, ''),
        projectId: c.Labels[LABELS.project] ?? null,
        deploymentId: c.Labels[LABELS.deployment] ?? null,
        running: c.State === 'running',
      }))
    },
  }
}

export type Docker = ReturnType<typeof createDocker>
