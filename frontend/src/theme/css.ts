import { DEPLOYMENT_STATUSES } from '@hangar/shared'
import {
  chartSeries,
  type ColorScheme,
  layout,
  motion,
  palettes,
  radius,
  space,
  statusColors,
  terminal,
  typography,
} from './tokens.ts'

/** The class on <html> that switches every variable to the dark palette. */
export const DARK_CLASS = 'hg-dark'

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

function colorVariables(scheme: ColorScheme): string[] {
  const vars = Object.entries(palettes[scheme]).map(([k, v]) => `--hg-${kebab(k)}: ${v};`)
  for (const status of DEPLOYMENT_STATUSES) {
    vars.push(`--hg-status-${status}: ${statusColors[scheme][status]};`)
  }
  chartSeries[scheme].forEach((color, i) => vars.push(`--hg-series-${i}: ${color};`))
  vars.push(`color-scheme: ${scheme};`)
  return vars
}

function sharedVariables(): string[] {
  const vars = [
    `--hg-font: ${typography.family};`,
    `--hg-data: ${typography.data};`,
    `--hg-mono: ${typography.mono};`,
    `--hg-heading-stretch: ${typography.headingStretch};`,
  ]
  for (const [k, v] of Object.entries(typography.size)) vars.push(`--hg-size-${k}: ${v};`)
  for (const [k, v] of Object.entries(typography.lineHeight)) vars.push(`--hg-lh-${k}: ${v};`)
  for (const [k, v] of Object.entries(typography.weight)) vars.push(`--hg-weight-${k}: ${v};`)
  for (const [k, v] of Object.entries(radius)) vars.push(`--hg-radius-${k}: ${v};`)
  for (const [k, v] of Object.entries(space)) vars.push(`--hg-space-${k}: ${v};`)
  for (const [k, v] of Object.entries(layout)) vars.push(`--hg-width-${k}: ${v};`)
  for (const [k, v] of Object.entries(motion)) vars.push(`--hg-motion-${k}: ${v};`)
  for (const [k, v] of Object.entries(terminal)) vars.push(`--hg-term-${k}: ${v};`)
  return vars
}

/** The tokens as CSS custom properties: light on :root, dark under the dark class. */
export function themeStylesheet(): string {
  return [
    `:root { ${[...sharedVariables(), ...colorVariables('light')].join(' ')} }`,
    `:root.${DARK_CLASS} { ${colorVariables('dark').join(' ')} }`,
  ].join('\n')
}

/** Adds the variables to the page once, before the app renders. */
export function installThemeVariables(doc: Document = document): void {
  const style = doc.createElement('style')
  style.id = 'hangar-theme'
  style.textContent = themeStylesheet()
  doc.head.prepend(style)
}

/** Reads a variable's current value, e.g. for Chart.js, which cannot use CSS variables. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
