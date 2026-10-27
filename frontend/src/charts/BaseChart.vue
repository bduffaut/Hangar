<script setup lang="ts" generic="T extends ChartType">
import type { ChartData, ChartOptions } from 'chart.js'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { isDark } from '../theme/useTheme.ts'
import { Chart, type ChartType } from './setup.ts'

// The one place that creates Chart.js charts. `build` returns data and options from the current
// theme, so a theme switch redraws the chart in the new colors.
const props = defineProps<{
  type: T
  build: () => { data: ChartData<T>; options: ChartOptions<T> }
  /** An accessible description of what the chart shows. */
  label: string
  height?: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const chart = shallowRef<Chart<T> | null>(null)

function draw() {
  if (!canvas.value) return
  const { data, options } = props.build()
  if (chart.value && chart.value.config.type === props.type) {
    chart.value.data = data
    chart.value.options = options
    chart.value.update('none')
    return
  }
  chart.value?.destroy()
  chart.value = new Chart(canvas.value, { type: props.type, data, options })
}

onMounted(draw)
watch(() => props.build, draw)
watch(isDark, () => {
  chart.value?.destroy()
  chart.value = null
  // Wait for the new theme variables to apply before reading them.
  requestAnimationFrame(draw)
})
onBeforeUnmount(() => chart.value?.destroy())

defineExpose({ redraw: draw })
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
}
</style>
