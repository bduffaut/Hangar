// The single source of every color, font, and size in the Control Tower. Change a value here and
// both our own styles (CSS variables) and the component library (its preset) follow.
import type { DeploymentStatus } from '@hangar/shared'

export type ColorScheme = 'dark' | 'light'

export interface Palette {
  /** Page background. */
  canvas: string
  /** Panels sitting on the canvas. */
  panel: string
  /** Inputs, hovered rows, and anything raised above a panel. */
  raised: string
  /** Hairline borders and dividers. */
  line: string
  /** Primary text. */
  ink: string
  /** Secondary text: help, timestamps, labels. */
  inkMuted: string
  /** The brand accent: links, primary buttons, focus rings. */
  accent: string
  /** Text placed on the accent color. */
  onAccent: string
  /** Background of the build log and runtime output. */
  console: string
  consoleInk: string
  /** Destructive actions. */
  danger: string
  /** Dims the page behind the guided tour. */
  scrim: string
}

/**
 * Cockpit panel (dark) and day panel (light). The canvas is the blue-gray of a flight deck rather
 * than black. The accent comes from airport taxiway signs: black on yellow at night, yellow on
 * black by day, so a primary button reads like a sign in both themes.
 */
export const palettes: Record<ColorScheme, Palette> = {
  dark: {
    canvas: '#1A2127',
    panel: '#222B33',
    raised: '#2B3640',
    line: '#36434F',
    ink: '#ECEFF1',
    inkMuted: '#9DAAB5',
    accent: '#F5C42C',
    onAccent: '#14181C',
    console: '#12171C',
    consoleInk: '#D7DEE4',
    danger: '#F45B5B',
    scrim: 'rgba(8, 11, 14, 0.66)',
  },
  light: {
    canvas: '#E7EBEE',
    panel: '#F8FAFB',
    raised: '#EEF2F4',
    line: '#CCD4DA',
    ink: '#151B20',
    inkMuted: '#56636E',
    accent: '#151B20',
    onAccent: '#F5C42C',
    console: '#1A2127',
    consoleInk: '#D7DEE4',
    danger: '#C22F2F',
    scrim: 'rgba(21, 27, 32, 0.5)',
  },
}

/**
 * Deployment status colors follow the color code of cockpit flight displays: cyan for a value
 * being set up (building), magenta for the active leg (taking off), green for engaged (live), red
 * for a warning. Each meets 3:1 against its panel as a dot and 4.5:1 as text (WCAG AA).
 */
export const statusColors: Record<ColorScheme, Record<DeploymentStatus, string>> = {
  dark: {
    queued: '#9AA6B1',
    building: '#4FC9E8',
    deploying: '#E486EA',
    ready: '#4FD889',
    failed: '#F45B5B',
    cancelled: '#76828E',
  },
  light: {
    queued: '#5A6772',
    building: '#0A7896',
    deploying: '#9E3399',
    ready: '#13784A',
    failed: '#C22F2F',
    cancelled: '#7D8994',
  },
}

/** Chart series colors after the status colors: accent first, then distinct hues. */
export const chartSeries: Record<ColorScheme, string[]> = {
  dark: ['#F5C42C', '#4FC9E8', '#E486EA', '#4FD889', '#FF9B5B'],
  light: ['#8A6A00', '#0A7896', '#9E3399', '#13784A', '#B8541F'],
}

/**
 * Terminal colors for build logs and runtime output. The console background is dark in both
 * themes, so one set works everywhere. `accent` marks Hangar's own lines in the log.
 */
export const terminal = {
  black: '#6B7891',
  red: '#FF7B7F',
  green: '#5FE3A1',
  yellow: '#F5C76B',
  blue: '#7FB2FF',
  magenta: '#D4A5FF',
  cyan: '#5FE3DD',
  white: '#ECEFF1',
  accent: '#F5C42C',
} as const

export const typography = {
  family: '"Archivo Variable", "Archivo", system-ui, -apple-system, "Segoe UI", sans-serif',
  /** B612: the typeface Airbus designed for cockpit displays. For readings, addresses, statuses. */
  data: '"B612", system-ui, -apple-system, "Segoe UI", sans-serif',
  /** For what people type or copy exactly: addresses in inputs, commit IDs, logs. */
  mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  /** Headings use Archivo's width axis: wide like a cockpit placard. */
  headingStretch: '118%',
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
  weight: { regular: '400', medium: '520', bold: '650' },
} as const

/** Controls are tighter than the panels that hold them; pills are for status only. */
export const radius = { sm: '3px', md: '5px', lg: '8px', pill: '999px' } as const

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
  fast: '120ms',
  base: '200ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const
