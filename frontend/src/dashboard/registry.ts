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

export function widgetById(id: string): DashboardWidget | undefined {
  return widgets.get(id)
}

/** Every registered widget, in the order they were registered. */
export const allWidgets = computed(() => [...widgets.values()])
