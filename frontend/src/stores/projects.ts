import type { DeploymentView, ProjectView } from '@hangar/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api/client.ts'

const RUNWAY_LIGHTS = 12

/** Every project, kept current by the live status stream (see stores/live.ts). */
export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectView[]>([])
  const loaded = ref(false)

  const byId = computed(() => new Map(projects.value.map((p) => [p.id, p])))
  const byName = computed(() => new Map(projects.value.map((p) => [p.name, p])))

  function upsert(project: ProjectView) {
    const index = projects.value.findIndex((p) => p.id === project.id)
    if (index === -1) projects.value = [...projects.value, project].sort((a, b) => a.name.localeCompare(b.name))
    else projects.value.splice(index, 1, project)
  }

  /** Applies a status change without refetching: updates latest, current, and the runway. */
  function applyDeployment(deployment: DeploymentView) {
    const project = byId.value.get(deployment.projectId)
    if (!project) return
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
    async load() {
      projects.value = await api('listProjects')
      loaded.value = true
    },
    async refresh(id: string) {
      upsert(await api('getProject', { params: { id } }))
    },
    remove(id: string) {
      projects.value = projects.value.filter((p) => p.id !== id)
    },
  }
})
