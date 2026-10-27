import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartOptions,
  type ChartType,
  DoughnutController,
  ArcElement,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { cssVar } from '../theme/css.ts'

// Only the pieces we draw, to keep the bundle small.
Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  ArcElement,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
)

export { Chart }
export type { ChartType }

/** Colors read from the theme at draw time (Chart.js cannot use CSS variables directly). */
export function chartColors() {
  return {
    ink: cssVar('--hg-ink'),
    muted: cssVar('--hg-ink-muted'),
    line: cssVar('--hg-line'),
    panel: cssVar('--hg-panel'),
    accent: cssVar('--hg-accent'),
    series: [0, 1, 2, 3, 4].map((i) => cssVar(`--hg-series-${i}`)),
    status: (status: string) => cssVar(`--hg-status-${status}`),
  }
}

/** Defaults every chart shares: theme fonts and colors, quiet grid, no legend. */
export function baseOptions<T extends ChartType>(): ChartOptions<T> {
  const c = chartColors()
  const font = { family: cssVar('--hg-font'), size: 12 }
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.panel,
        titleColor: c.ink,
        bodyColor: c.ink,
        borderColor: c.line,
        borderWidth: 1,
        padding: 10,
        titleFont: font,
        bodyFont: font,
        displayColors: false,
      },
    },
    scales: {},
    color: c.muted,
    font,
  } as ChartOptions<T>
}

/** `#rrggbb` with an alpha, as canvas-safe rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** A soft vertical fade from a color to transparent, for line chart fills. */
export function fade(ctx: CanvasRenderingContext2D, color: string, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, withAlpha(color, 0.32))
  gradient.addColorStop(1, withAlpha(color, 0))
  return gradient
}
