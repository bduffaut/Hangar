import { type GridWidget, toSavedLayout } from 'custom-dashboard-grid'
import { ref } from 'vue'
import { api } from '../api/client.ts'
import { defaultLayout, LAYOUT_VERSION, restoreLayout } from './layout.ts'

/** Saves wait this long after the last change, so a drag saves once. */
const SAVE_DELAY_MS = 600

/**
 * The home screen's layout, kept on the server with the signed-in account so it follows you to
 * any browser. Loads once; saves shortly after each change made by the owner.
 */
export function useDashboardLayout() {
  const widgets = ref<GridWidget[]>([])
  const loaded = ref(false)
  const customized = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function load() {
    const saved = await api('getDashboardLayout').catch(() => null)
    customized.value = !!saved?.layout
    widgets.value = restoreLayout(saved?.layout ?? null)
    loaded.value = true
  }

  async function saveNow() {
    if (timer) clearTimeout(timer)
    timer = null
    const { widgets: saved } = toSavedLayout(widgets.value, LAYOUT_VERSION)
    const layout = saved.map((w) => ({ ...w, type: w.type ?? w.id }))
    await api('saveDashboardLayout', { body: { layout } })
    customized.value = true
  }

  function save() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void saveNow().catch(() => {}), SAVE_DELAY_MS)
  }

  /** Back to the layout every new install starts with. */
  function reset() {
    widgets.value = defaultLayout()
    save()
  }

  return { widgets, loaded, customized, load, save, saveNow, reset }
}
