import { computed, reactive, ref, watch } from 'vue'
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

export const allWidgets = computed(() =>
  [...widgets.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
)

// The person's layout: which widgets are on and in what order, remembered per browser.
const STORAGE_KEY = 'hangar.dashboard'

interface SavedLayout {
  order: string[]
  hidden: string[]
  /** Widgets that are off by default but turned on by the person. */
  shown: string[]
}

function readLayout(): SavedLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<SavedLayout>
    return { order: parsed.order ?? [], hidden: parsed.hidden ?? [], shown: parsed.shown ?? [] }
  } catch {
    return { order: [], hidden: [], shown: [] }
  }
}

const layout = ref<SavedLayout>(readLayout())
watch(
  layout,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // Private browsing: the layout lasts for this visit.
    }
  },
  { deep: true },
)

/** Widgets in the person's order; new widgets join in their default position. */
export const orderedWidgets = computed(() => {
  const rank = new Map(layout.value.order.map((id, i) => [id, i]))
  return [...allWidgets.value].sort((a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra !== undefined && rb !== undefined) return ra - rb
    return a.order - b.order
  })
})

export function isWidgetShown(widget: DashboardWidget): boolean {
  if (layout.value.hidden.includes(widget.id)) return false
  return widget.enabledByDefault || layout.value.shown.includes(widget.id)
}

export function setWidgetShown(widget: DashboardWidget, shown: boolean): void {
  const hidden = layout.value.hidden.filter((id) => id !== widget.id)
  const on = layout.value.shown.filter((id) => id !== widget.id)
  layout.value = {
    ...layout.value,
    hidden: shown ? hidden : [...hidden, widget.id],
    shown: shown ? [...on, widget.id] : on,
  }
}

export function moveWidget(widget: DashboardWidget, offset: -1 | 1): void {
  const ids = orderedWidgets.value.map((w) => w.id)
  const from = ids.indexOf(widget.id)
  const to = from + offset
  if (to < 0 || to >= ids.length) return
  ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
  layout.value = { ...layout.value, order: ids }
}

export function resetLayout(): void {
  layout.value = { order: [], hidden: [], shown: [] }
}
