export { default as BaseChart } from './BaseChart.vue'
export { baseOptions, chartColors, fade, withAlpha } from './setup.ts'
// Chart data and option shapes, re-exported so components need not import the chart library.
export type { ChartData, ChartOptions } from 'chart.js'
