import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { allWidgets, registerWidget, widgetById } from './registry.ts'

const widget = (id: string) => ({
  id,
  title: id,
  description: '',
  category: 'Test',
  component: defineComponent({}),
  size: { w: 2, h: 2 },
})

registerWidget(widget('b'))
registerWidget(widget('a'))

describe('dashboard registry', () => {
  it('lists widgets in the order they were registered', () => {
    expect(allWidgets.value.map((w) => w.id)).toEqual(['b', 'a'])
  })

  it('finds a widget by id', () => {
    expect(widgetById('a')?.title).toBe('a')
    expect(widgetById('missing')).toBeUndefined()
  })

  it('refuses duplicate widget ids', () => {
    expect(() => registerWidget(widget('a'))).toThrow('already registered')
  })
})
