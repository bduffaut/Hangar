// The public contract for dashboard extensions. An external package (your own widget library)
// depends only on these types, never on the app's stores or component library.
import type { MetricsSample, ProjectView, DeploymentView } from '@hangar/shared'
import type { Component, Ref } from 'vue'

/** How much of the dashboard's width a widget takes on wide screens. Narrow screens stack. */
export type WidgetSize = 'full' | 'half' | 'third'

/**
 * The props every widget component receives. Widgets get all their data this way, so an external
 * widget package needs nothing from inside the app except these types.
 */
export interface DashboardWidgetProps {
  data: DashboardData
}

export interface DashboardWidget {
  /** Unique and stable: saved layouts refer to it. Prefix with your package name. */
  id: string
  title: string
  description: string
  /** A Vue component accepting `DashboardWidgetProps`. */
  component: Component
  size: WidgetSize
  /** Shown on the dashboard. Set false to register a widget without showing it yet. */
  enabledByDefault: boolean
  /** Lower comes first in the default order. */
  order: number
}

/** Data any widget may read (never write). Values update live. */
export interface DashboardData {
  projects: Readonly<Ref<ProjectView[]>>
  /** False until the project list has loaded once (so an empty list is not mistaken for none). */
  projectsLoaded: Readonly<Ref<boolean>>
  /** Deployments in progress right now. */
  activeDeployments: Readonly<Ref<DeploymentView[]>>
  /**
   * Up to 15 minutes of host and container samples, oldest first. Kept streaming while the
   * dashboard is on screen.
   */
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
