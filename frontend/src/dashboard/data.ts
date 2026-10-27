import { computed } from 'vue'
import { useLiveStore } from '../stores/live.ts'
import { useMetricsStore } from '../stores/metrics.ts'
import { useProjectsStore } from '../stores/projects.ts'
import type { DashboardData } from './types.ts'

/** The data passed to widgets. The one place that connects widgets to the stores; read-only. */
export function useDashboardData(): DashboardData {
  const projects = useProjectsStore()
  const live = useLiveStore()
  const metrics = useMetricsStore()
  return {
    projects: computed(() => projects.projects),
    projectsLoaded: computed(() => projects.loaded),
    activeDeployments: computed(() => live.active),
    metrics: computed(() => metrics.samples),
  }
}
