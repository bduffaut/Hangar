<script setup lang="ts" generic="T extends ChartType">
import type { ChartData, ChartOptions } from 'chart.js'
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { isDark } from '../theme/useTheme.ts'
import { Chart, type ChartType } from './setup.ts'

// The one place that creates Chart.js charts. `build` returns data and options; it runs inside a
// reactive effect, so the chart redraws whenever anything `build` reads changes (new samples,
// new deployments) and when the theme switches.
const props = defineProps<{
  type: T
  build: () => { data: ChartData<T>; options: ChartOptions<T> }
  /** An accessible description of what the chart shows. */
  label: string
  height?: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
// Bumped after a theme switch so the effect re-reads the new theme colors.
const themeVersion = ref(0)
// A plain variable, not a ref: the effect must not track the chart instance itself.
let chart: Chart<T> | null = null

watch(isDark, () => {
  chart?.destroy()
  chart = null
  // Wait a frame for the new theme variables to apply before reading them.
  requestAnimationFrame(() => themeVersion.value++)
})

let stop: (() => void) | null = null
onMounted(() => {
  stop = watchEffect(() => {
    void themeVersion.value
    if (!canvas.value) return
    const { data, options } = props.build()
    if (chart && (chart.config as { type?: string }).type === props.type) {
      chart.data = data
      chart.options = options
      chart.update('none')
      return
    }
    chart?.destroy()
    chart = new Chart(canvas.value, { type: props.type, data, options })
  })
})

onBeforeUnmount(() => {
  stop?.()
  chart?.destroy()
  chart = null
})
</script>

<template>
  <div class="hg-chart" :style="{ height: height ?? '10rem' }">
    <canvas ref="canvas" role="img" :aria-label="label" />
  </div>
</template>

<style scoped>
.hg-chart {
  position: relative;
  width: 100%;
  /* Chart.js sizes the canvas from its container; without these a chart in a grid or flex cell
     can push its cell wider on every resize and grow without end. */
  min-width: 0;
  overflow: hidden;
}
</style>
