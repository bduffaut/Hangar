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
}

/**
 * Night panel (dark) and day panel (light). Navy instead of black keeps long sessions easy on the
 * eyes; the radar teal accent never collides with a deployment status color.
 */
export const palettes: Record<ColorScheme, Palette> = {
  dark: {
    canvas: '#0F1A2B',
    panel: '#15233A',
    raised: '#1D2E4A',
    line: '#2B3F60',
    ink: '#E7EDF6',
    inkMuted: '#97A7BF',
    accent: '#36CFC9',
    onAccent: '#04201F',
    console: '#0A1322',
    consoleInk: '#D4DEEC',
    danger: '#F2555A',
  },
  light: {
    canvas: '#EDF1F7',
    panel: '#FFFFFF',
    raised: '#F4F7FB',
    line: '#D3DCE8',
    ink: '#13213A',
    inkMuted: '#56677F',
    accent: '#087A75',
    onAccent: '#FFFFFF',
    console: '#0F1A2B',
    consoleInk: '#D4DEEC',
    danger: '#C9302C',
  },
}

/**
 * Deployment status colors (gray holding, amber preflight, blue taking off, green, red). Each meets
 * 3:1 contrast against its panel as a dot, and the text tones meet 4.5:1 (WCAG AA).
 */
export const statusColors: Record<ColorScheme, Record<DeploymentStatus, string>> = {
  dark: {
    queued: '#8A97AB',
    building: '#F2B441',
    deploying: '#5B9BFF',
    ready: '#3DD68C',
    failed: '#F2555A',
    cancelled: '#6B7891',
  },
  light: {
    queued: '#5F6E85',
    building: '#946200',
    deploying: '#2F6FDB',
    ready: '#13894F',
    failed: '#C9302C',
    cancelled: '#8A96A8',
  },
}

/** Chart series colors after the status colors: accent first, then distinct hues. */
export const chartSeries: Record<ColorScheme, string[]> = {
  dark: ['#36CFC9', '#5B9BFF', '#F2B441', '#C38BFF', '#FF8A5B'],
  light: ['#087A75', '#2F6FDB', '#946200', '#8A4FD8', '#D4622F'],
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
  white: '#E7EDF6',
  accent: '#5FE3DD',
} as const

export const typography = {
  family: '"Archivo Variable", "Archivo", system-ui, -apple-system, "Segoe UI", sans-serif',
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

export const radius = { sm: '4px', md: '8px', lg: '12px', pill: '999px' } as const

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
} as const

export const motion = {
  fast: '120ms',
  base: '200ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const
