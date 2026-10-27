import { computed, reactive } from 'vue'
import type { DashboardPlugin, DashboardWidget } from './types.ts'

const widgets = reactive(new Map<string, DashboardWidget>())

export function registerWidget(widget: DashboardWidget): void {
  if (widgets.has(widget.id))
    throw new Error(`A dashboard widget "${widget.id}" is already registered`)
  widgets.set(widget.id, widget)
}

export function installDashboardPlugin(plugin: DashboardPlugin): void {
  plugin.install({ registerWidget })
}

/** Every registered widget in its default order. */
export const allWidgets = computed(() =>
  [...widgets.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
)
