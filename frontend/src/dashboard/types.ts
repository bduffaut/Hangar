// The public contract for dashboard extensions. An external package (your own widget library)
// depends only on these types, never on the app's stores or component library.
import type { MetricsSample, ProjectView, DeploymentView } from '@hangar/shared'
import type { Component, Ref } from 'vue'

/**
 * Size in grid cells: 12 columns on wide screens, and rows 8px tall that include 16px of space
 * below the widget. `rowsFor(px)` from the dashboard module converts a height in pixels.
 */
export interface WidgetSize {
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

/**
 * The props every widget component receives. Widgets get all their data this way, so an external
 * widget package needs nothing from inside the app except these types. A widget's own `props`
 * (see `DashboardWidget`) are passed alongside.
 */
export interface DashboardWidgetProps {
  data: DashboardData
}

export interface DashboardWidget {
  /** Unique and stable: saved layouts refer to it. Prefix with your package name. */
  id: string
  /** Shown at the top of the widget and in the add list. */
  title: string
  /** One line for the add list. */
  description: string
  /** Groups the add list. */
  category: string
  /** A Vue component accepting `DashboardWidgetProps`. */
  component: Component
  /** Extra props for the component, so one component can serve several widgets. */
  props?: Record<string, unknown>
  /** Size when added. */
  size: WidgetSize
  /** Grow and shrink with the content instead of a fixed height, like a list. */
  sizeToContent?: boolean
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
