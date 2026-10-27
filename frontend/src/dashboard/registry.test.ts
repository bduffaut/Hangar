import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { allWidgets, registerWidget } from './registry.ts'

const widget = (id: string, order: number) => ({
  id,
  title: id,
  description: '',
  component: defineComponent({}),
  size: 'full' as const,
  enabledByDefault: true,
  order,
})

registerWidget(widget('b', 2))
registerWidget(widget('a', 1))

describe('dashboard registry', () => {
  it('lists widgets in their default order', () => {
    expect(allWidgets.value.map((w) => w.id)).toEqual(['a', 'b'])
  })

  it('refuses duplicate widget ids', () => {
    expect(() => registerWidget(widget('a', 9))).toThrow('already registered')
  })
})
