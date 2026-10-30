// The single source of every color, font, and size in the Control Tower. Change a value here and
// both our own styles (CSS variables) and the component library (its preset) follow.
import type { DeploymentStatus } from '@hangar/shared'

export type ColorScheme = 'dark' | 'light'

export interface Palette {
  /** Page background. */
  canvas: string
  /** Panels and strips sitting on the canvas. */
  panel: string
  /** Inputs, hovered rows, and anything raised above a panel. */
  raised: string
  /** Hairline borders and dividers. */
  line: string
  /** Primary text. */
  ink: string
  /** Secondary text: help, timestamps, labels. */
  inkMuted: string
  /** The magenta line: focus rings, active navigation, routes, selected things. */
  accent: string
  /** Fill of primary buttons: the magenta line, deep enough for white text. */
  accentFill: string
  /** Text placed on the accent fill. */
  onAccent: string
  /** Links: the blue of airports on an aeronautical chart. */
  link: string
  /** Gauge readings in their caution range. */
  caution: string
  /** Background of the build log and runtime output. */
  console: string
  consoleInk: string
  /** Destructive actions. */
  danger: string
  /** Dims the page behind dialogs and the guided tour. */
  scrim: string
}

/**
 * Night chart (dark) and day chart (light), after aeronautical charts: deep navy or white paper,
 * airport blue for links, and magenta, the color of the course line on a navigation display, as
 * the one accent. Magenta means "on the route": primary actions and deployments under way.
 */
export const palettes: Record<ColorScheme, Palette> = {
  dark: {
    canvas: '#0E1A2B',
    panel: '#13223A',
    raised: '#1A2D48',
    line: '#263C5A',
    ink: '#E9EFF6',
    inkMuted: '#93A6BE',
    accent: '#F062C0',
    accentFill: '#C0338F',
    onAccent: '#FFFFFF',
    link: '#7DB8F7',
    caution: '#F2B33D',
    console: '#0A1422',
    consoleInk: '#D5DEE9',
    danger: '#FF6B6B',
    scrim: 'rgba(5, 10, 18, 0.7)',
  },
  light: {
    canvas: '#EEF2F6',
    panel: '#FFFFFF',
    raised: '#E4EAF1',
    line: '#CBD5E1',
    ink: '#0E1A2B',
    inkMuted: '#4E6079',
    accent: '#A8247E',
    accentFill: '#A8247E',
    onAccent: '#FFFFFF',
    link: '#1859A8',
    caution: '#9A6200',
    console: '#0E1A2B',
    consoleInk: '#D5DEE9',
    danger: '#C42B2B',
    scrim: 'rgba(14, 26, 43, 0.5)',
  },
}

/**
 * Deployment status colors follow the color code of glass cockpit displays: cyan for a value
 * being set up (building), magenta for the active leg (taking off), green for engaged (live), red
 * for a warning. Each meets 3:1 against its panel as a mark and 4.5:1 as text (WCAG AA).
 */
export const statusColors: Record<ColorScheme, Record<DeploymentStatus, string>> = {
  dark: {
    queued: '#9AABC0',
    building: '#4FD1EA',
    deploying: '#F062C0',
    ready: '#4FDB8E',
    failed: '#FF6B6B',
    cancelled: '#7C8EA6',
  },
  light: {
    queued: '#55667D',
    building: '#0A7894',
    deploying: '#A8247E',
    ready: '#127A47',
    failed: '#C42B2B',
    cancelled: '#6E7F96',
  },
}

/** Chart series colors: the magenta line first, then distinct chart hues. */
export const chartSeries: Record<ColorScheme, string[]> = {
  dark: ['#F062C0', '#4FD1EA', '#7DB8F7', '#4FDB8E', '#F2B33D'],
  light: ['#A8247E', '#0A7894', '#1859A8', '#127A47', '#9A6200'],
}

/**
 * Terminal colors for build logs and runtime output. The console background is dark in both
 * themes, so one set works everywhere. `accent` marks Hangar's own lines in the log.
 */
export const terminal = {
  black: '#6F819B',
  red: '#FF7B7F',
  green: '#5FE3A1',
  yellow: '#F5C76B',
  blue: '#7DB8F7',
  magenta: '#F48AD0',
  cyan: '#5FE3DD',
  white: '#E9EFF6',
  accent: '#F062C0',
} as const

export const typography = {
  /**
   * B612, the typeface Airbus designed for cockpit screens, for everything: one family keeps the
   * page quiet and every reading legible at a glance.
   */
  family: '"B612", system-ui, -apple-system, "Segoe UI", sans-serif',
  /** Readings, addresses, statuses. The same face; kept separate so it can change on its own. */
  data: '"B612", system-ui, -apple-system, "Segoe UI", sans-serif',
  /**
   * For what people type or copy exactly: commit IDs, addresses in inputs, logs. B612 Mono spaces
   * its punctuation too widely for addresses ("127. 0. 0. 1"), so code gets its own face.
   */
  mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  /** A modular scale (ratio 1.2) in rem. */
  size: {
    xs: '0.75rem',
    sm: '0.8125rem',
    base: '0.9375rem',
    md: '1.0625rem',
    lg: '1.3125rem',
    xl: '1.625rem',
    xxl: '2.125rem',
  },
  lineHeight: { tight: '1.2', body: '1.55', console: '1.6' },
  weight: { regular: '400', bold: '700' },
} as const

/** Chart linework: nearly square corners everywhere; pills are for status only. */
export const radius = { sm: '2px', md: '3px', lg: '4px', pill: '999px' } as const

export const space = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.5rem',
  6: '2rem',
  7: '3rem',
} as const

export const layout = {
  /** Comfortable reading width for forms and prose. */
  narrow: '40rem',
  /** Main content width. */
  wide: '76rem',
  /** Height of the log viewers. */
  console: 'min(65vh, 40rem)',
} as const

export const motion = {
  fast: '140ms',
  base: '220ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const
