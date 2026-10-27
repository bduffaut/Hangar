import { computed } from 'vue'
import { useLiveStore } from '../stores/live.ts'
import { useMetricsStore } from '../stores/metrics.ts'
import { useProjectsStore } from '../stores/projects.ts'
import type { DashboardData } from './types.ts'

/** The data widgets see. The one place that connects widgets to the stores; refs are read-only. */
export function useDashboardData(): DashboardData {
  const projects = useProjectsStore()
  const live = useLiveStore()
  const metrics = useMetricsStore()
  return {
    projects: computed(() => projects.projects),
    activeDeployments: computed(() => live.active),
    metrics: computed(() => metrics.samples),
  }
}
