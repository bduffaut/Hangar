import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'

// The registry keeps its layout in localStorage; give it an in-memory one.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage

const { isWidgetShown, moveWidget, registerWidget, resetLayout, setWidgetShown, orderedWidgets } =
  await import('./registry.ts')

const widget = (id: string, order: number, enabledByDefault = true) => ({
  id,
  title: id,
  description: '',
  component: defineComponent({}),
  size: 'full' as const,
  enabledByDefault,
  order,
})

registerWidget(widget('a', 1))
registerWidget(widget('b', 2))
registerWidget(widget('optional', 3, false))

describe('dashboard layout', () => {
  it('shows default widgets and hides optional ones', () => {
    resetLayout()
    expect(orderedWidgets.value.map((w) => isWidgetShown(w))).toEqual([true, true, false])
  })

  it('reorders without turning optional widgets on', () => {
    resetLayout()
    moveWidget(orderedWidgets.value[1]!, -1)
    expect(orderedWidgets.value.map((w) => w.id)).toEqual(['b', 'a', 'optional'])
    expect(isWidgetShown(orderedWidgets.value[2]!)).toBe(false)
  })

  it('turns widgets on and off', () => {
    resetLayout()
    const optional = orderedWidgets.value[2]!
    setWidgetShown(optional, true)
    expect(isWidgetShown(optional)).toBe(true)
    setWidgetShown(orderedWidgets.value[0]!, false)
    expect(isWidgetShown(orderedWidgets.value[0]!)).toBe(false)
  })

  it('refuses duplicate widget ids', () => {
    expect(() => registerWidget(widget('a', 9))).toThrow('already registered')
  })
})
