import { computed, reactive, ref } from 'vue'
import type { DashboardPlugin, DashboardWidget } from './types.ts'

const widgets = reactive(new Map<string, DashboardWidget>())
const showAdminWidgets = ref(true)

/** Members get no server readings, so widgets built on them are left out of their dashboard. */
export function setShowAdminWidgets(show: boolean): void {
  showAdminWidgets.value = show
}

const visible = (widget: DashboardWidget) => showAdminWidgets.value || !widget.adminOnly

export function registerWidget(widget: DashboardWidget): void {
  if (widgets.has(widget.id))
    throw new Error(`A dashboard widget "${widget.id}" is already registered`)
  widgets.set(widget.id, widget)
}

export function installDashboardPlugin(plugin: DashboardPlugin): void {
  plugin.install({ registerWidget })
}

export function widgetById(id: string): DashboardWidget | undefined {
  const widget = widgets.get(id)
  return widget && visible(widget) ? widget : undefined
}

/** Every registered widget, in the order they were registered. */
export const allWidgets = computed(() => [...widgets.values()].filter(visible))
