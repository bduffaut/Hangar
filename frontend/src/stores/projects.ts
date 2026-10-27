import type { DeploymentView, ProjectView } from '@hangar/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api/client.ts'

const RUNWAY_LIGHTS = 12

/** Every project, kept current by the live status stream (see stores/live.ts). */
export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectView[]>([])
  const loaded = ref(false)
  let inFlight: Promise<void> | null = null

  const byId = computed(() => new Map(projects.value.map((p) => [p.id, p])))
  const byName = computed(() => new Map(projects.value.map((p) => [p.name, p])))

  function upsert(project: ProjectView) {
    const index = projects.value.findIndex((p) => p.id === project.id)
    if (index === -1) {
      projects.value = [...projects.value, project].sort((a, b) => a.name.localeCompare(b.name))
    } else projects.value.splice(index, 1, project)
  }

  /** Loads the list; callers at the same moment share one request. */
  function load(): Promise<void> {
    inFlight ??= api('listProjects')
      .then((list) => {
        projects.value = list
        loaded.value = true
      })
      .finally(() => (inFlight = null))
    return inFlight
  }

  /** Applies a status change without refetching: updates latest, current, and the runway. */
  function applyDeployment(deployment: DeploymentView) {
    const project = byId.value.get(deployment.projectId)
    if (!project) {
      // A project created elsewhere (another tab, the CLI): fetch the list again.
      if (loaded.value) void load().catch(() => {})
      return
    }
    const next: ProjectView = { ...project }
    if (!next.latest || deployment.number >= next.latest.number) next.latest = deployment
    if (deployment.isCurrent) next.current = deployment
    else if (next.current?.id === deployment.id) next.current = { ...next.current, ...deployment }
    const recent = next.recent.filter((d) => d.id !== deployment.id)
    recent.push({ id: deployment.id, number: deployment.number, status: deployment.status })
    next.recent = recent.sort((a, b) => a.number - b.number).slice(-RUNWAY_LIGHTS)
    upsert(next)
  }

  return {
    projects,
    loaded,
    byId,
    byName,
    upsert,
    applyDeployment,
    load,
    /** Loads once; later calls reuse the list the live stream keeps current. */
    ensureLoaded: () => (loaded.value ? Promise.resolve() : load()),
    async refresh(id: string) {
      upsert(await api('getProject', { params: { id } }))
    },
    remove(id: string) {
      projects.value = projects.value.filter((p) => p.id !== id)
    },
    reset() {
      projects.value = []
      loaded.value = false
    },
  }
})
