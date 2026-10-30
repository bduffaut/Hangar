import { type GridWidget, parseLayout } from 'custom-dashboard-grid'
import { widgetById } from './registry.ts'

/** Bump when saved layouts need upgrading; `restoreLayout` falls back to the default. */
export const LAYOUT_VERSION = 1

/**
 * 12 columns, 16px apart, of short 8px rows with no gap between them: each widget keeps its own
 * 16px of space below it, so widgets sized to their content sit exactly as far apart as the rest.
 * Narrow screens and tablets use two columns.
 */
export const GRID = {
  columns: 12,
  rowHeight: 8,
  space: 16,
  gap: [16, 0] as [number, number],
  // Below the wide layout, widgets stack in reading order two columns across: instruments pair
  // up, wider widgets take the full width.
  breakpoints: {
    wide: { width: 900, columns: 12 },
    narrow: { width: 0, columns: 2 },
  },
} as const

/** Grid rows a widget needs to show `px` of content plus the space below it. */
export const rowsFor = (px: number) => Math.ceil((px + GRID.space) / GRID.rowHeight)

/**
 * Where each widget sits on a fresh dashboard, top to bottom; the grid floats each one up as far
 * as it goes. Widget ids double as their type; sizes come from the registry unless given here.
 */
const DEFAULT_PLACEMENT: { id: string; x: number; y: number; w?: number }[] = [
  { id: 'hangar.departures', x: 0, y: 0 },
  { id: 'hangar.cpu', x: 0, y: 20 },
  { id: 'hangar.memory', x: 2, y: 20 },
  { id: 'hangar.disk', x: 4, y: 20 },
  { id: 'hangar.temperature', x: 6, y: 20 },
  { id: 'hangar.battery', x: 8, y: 20 },
  { id: 'hangar.uptime', x: 10, y: 20 },
  { id: 'hangar.projects', x: 0, y: 60 },
  { id: 'hangar.activity', x: 0, y: 100, w: 7 },
  { id: 'hangar.outcomes', x: 7, y: 100, w: 5 },
]

/** A grid entry for a registered widget, with its current size rules from the registry. */
export function widgetFor(id: string, at?: { x: number; y: number; w?: number; h?: number }) {
  const widget = widgetById(id)
  if (!widget) return null
  const { minW, minH, maxW, maxH } = widget.size
  const entry: GridWidget = {
    id,
    type: id,
    x: at?.x ?? 0,
    y: at?.y ?? 0,
    w: at?.w ?? widget.size.w,
    h: at?.h ?? widget.size.h,
    minW,
    minH,
    maxW,
    maxH,
  }
  if (widget.sizeToContent) entry.sizeToContent = true
  return entry
}

export function defaultLayout(): GridWidget[] {
  return DEFAULT_PLACEMENT.flatMap((p) => widgetFor(p.id, p) ?? [])
}

/**
 * A saved layout, cleaned: unknown or duplicate widgets are dropped and each widget's size rules
 * come from the registry, so a saved layout never keeps limits a widget no longer has. Anything
 * unreadable gives the default layout.
 */
export function restoreLayout(saved: unknown): GridWidget[] {
  if (saved === null || saved === undefined) return defaultLayout()
  const parsed = parseLayout<GridWidget>(saved, {
    version: LAYOUT_VERSION,
    fallback: defaultLayout,
  })
  const seen = new Set<string>()
  const widgets: GridWidget[] = []
  for (const item of parsed) {
    if (seen.has(item.id)) continue
    const fresh = widgetFor(item.id, item)
    if (!fresh) continue
    seen.add(item.id)
    widgets.push({ ...fresh, collapsed: item.collapsed, breakpoints: item.breakpoints })
  }
  return widgets
}
