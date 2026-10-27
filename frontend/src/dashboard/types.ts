// The public contract for dashboard extensions. An external package (your own widget library)
// depends only on these types, never on the app's stores or component library.
import type { MetricsSample, ProjectView, DeploymentView } from '@hangar/shared'
import type { Component, Ref } from 'vue'

/** How much of the dashboard's width a widget takes on wide screens. Narrow screens stack. */
export type WidgetSize = 'full' | 'half' | 'third'

export interface DashboardWidget {
  /** Unique and stable: saved layouts refer to it. Prefix with your package name. */
  id: string
  title: string
  description: string
  component: Component
  size: WidgetSize
  /** Shown until the person turns it off. */
  enabledByDefault: boolean
  /** Lower comes first in the default order. */
  order: number
}

/** Data any widget may read (never write). Values update live. */
export interface DashboardData {
  projects: Readonly<Ref<ProjectView[]>>
  /** Deployments in progress right now. */
  activeDeployments: Readonly<Ref<DeploymentView[]>>
  /** Up to 15 minutes of host and container samples, oldest first. */
  metrics: Readonly<Ref<MetricsSample[]>>
}

export interface DashboardApi {
  registerWidget(widget: DashboardWidget): void
}

/** What an external widget library exports: `export default defineDashboardPlugin({ … })`. */
export interface DashboardPlugin {
  name: string
  install(api: DashboardApi): void
}

export const defineDashboardPlugin = (plugin: DashboardPlugin) => plugin
