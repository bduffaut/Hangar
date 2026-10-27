<script setup lang="ts">
import type { ChartData, ChartOptions } from '../charts/index.ts'
import { computed } from 'vue'
import { BaseChart, baseOptions, chartColors } from '../charts/index.ts'

// A half-circle gauge for a percentage, like an instrument dial. Turns amber above 75% and red
// above 90%, so a full disk or a busy CPU stands out.
const props = defineProps<{
  percent: number | null
  label: string
  caption: string
  detail: string
}>()

const tone = computed(() => {
  const p = props.percent ?? 0
  return p >= 90 ? '--hg-status-failed' : p >= 75 ? '--hg-status-building' : '--hg-accent'
})

const build = computed(() => () => {
  const c = chartColors()
  const value = Math.max(0, Math.min(100, props.percent ?? 0))
  const color = getComputedStyle(document.documentElement).getPropertyValue(tone.value).trim()
  const data: ChartData<'doughnut'> = {
    datasets: [
      {
        data: [value, 100 - value],
        backgroundColor: [color, c.line],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      },
    ],
  }
  const options: ChartOptions<'doughnut'> = {
    ...baseOptions<'doughnut'>(),
    cutout: '78%',
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
  }
  return { data, options }
})
</script>

<template>
  <figure class="hg-gauge">
    <div class="hg-gauge-dial">
      <BaseChart type="doughnut" :build="build" :label="`${caption}: ${label}`" height="5.5rem" />
      <span class="hg-gauge-value">{{ percent === null ? '–' : `${Math.round(percent)}%` }}</span>
    </div>
    <figcaption>
      <span class="hg-gauge-caption">{{ caption }}</span>
      <span class="hg-muted hg-gauge-detail">{{ detail }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.hg-gauge {
  margin: 0;
  /* Grid items default to their content's width; this lets three dials share a phone screen. */
  min-width: 0;
  display: grid;
  gap: var(--hg-space-2);
  /* Stretch (not center) so the dial's width is measured against the cell, not its content. */
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  text-align: center;
}
.hg-gauge-dial {
  position: relative;
  width: 100%;
  max-width: 9rem;
}
@media (max-width: 36rem) {
  .hg-gauge-value {
    font-size: var(--hg-size-md);
  }
}
.hg-gauge-value {
  position: absolute;
  inset: auto 0 0.1rem;
  font-size: var(--hg-size-xl);
  font-weight: var(--hg-weight-bold);
  font-stretch: 112%;
}
figcaption {
  display: grid;
}
.hg-gauge-caption {
  font-weight: var(--hg-weight-medium);
}
.hg-gauge-detail {
  font-size: var(--hg-size-xs);
}
</style>
