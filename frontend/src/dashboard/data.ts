import { readonly } from 'vue'
import { storeToRefs } from 'pinia'
import { useLiveStore } from '../stores/live.ts'
import { useMetricsStore } from '../stores/metrics.ts'
import { useProjectsStore } from '../stores/projects.ts'
import type { DashboardData } from './types.ts'

/** The read-only data widgets see. The one place that connects widgets to the stores. */
export function useDashboardData(): DashboardData {
  const { projects } = storeToRefs(useProjectsStore())
  const { active } = storeToRefs(useLiveStore())
  const { samples } = storeToRefs(useMetricsStore())
  return {
    projects: readonly(projects),
    activeDeployments: readonly(active),
    metrics: readonly(samples),
  }
}
