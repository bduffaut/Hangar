<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import { computed } from 'vue'
import { BaseChart, baseOptions, chartColors, fade } from '../charts/index.ts'

// A small trend line without axes. `color` is a theme variable name, e.g. '--hg-series-0'.
const props = withDefaults(
  defineProps<{ values: (number | null)[]; label: string; color?: string; max?: number; height?: string }>(),
  { color: '--hg-accent', height: '2.75rem' },
)

const build = computed(() => () => {
  const c = chartColors()
  const stroke = getComputedStyle(document.documentElement).getPropertyValue(props.color).trim() || c.accent
  const options = baseOptions<'line'>()
  const data: ChartData<'line'> = {
    labels: props.values.map((_, i) => i),
    datasets: [
      {
        data: props.values,
        borderColor: stroke,
        borderWidth: 1.75,
        pointRadius: 0,
        tension: 0.35,
        fill: true,
        spanGaps: true,
        backgroundColor: (ctx) => fade(ctx.chart.ctx, stroke, ctx.chart.height),
      },
    ],
  }
  const opts: ChartOptions<'line'> = {
    ...options,
    plugins: { ...options.plugins, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, min: 0, suggestedMax: props.max },
    },
  }
  return { data, options: opts }
})
</script>

<template>
  <BaseChart type="line" :build="build" :label="label" :height="height" />
</template>
