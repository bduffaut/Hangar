import Anser from 'anser'

export interface AnsiSegment {
  text: string
  /** CSS classes for the color and weight, from a fixed set (never from the log itself). */
  classes: string[]
}

const COLORS = new Set(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'])

function colorClass(prefix: 'fg' | 'bg', value: string | null): string | null {
  if (!value) return null
  const name = value.replace(/^ansi-/, '').replace(/^bright-/, '')
  return COLORS.has(name) ? `ansi-${prefix}-${name}` : null
}

/**
 * Splits a log line with terminal color codes into plain-text segments. The result is rendered as
 * text, never as HTML, so a build log cannot inject markup into the page.
 */
export function parseAnsi(line: string): AnsiSegment[] {
  if (!line.includes('\u001b[')) return [{ text: line, classes: [] }]
  return Anser.ansiToJson(line, { use_classes: true, remove_empty: true }).map((part) => {
    const classes = [colorClass('fg', part.fg), colorClass('bg', part.bg)].filter(
      (c): c is string => c !== null,
    )
    if (part.decorations.includes('bold')) classes.push('ansi-bold')
    if (part.decorations.includes('dim')) classes.push('ansi-dim')
    return { text: part.content, classes }
  })
}
