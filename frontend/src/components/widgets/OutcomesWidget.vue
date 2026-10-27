<script setup lang="ts">
import { DEPLOYMENT_STATUSES, statusCopy } from '@hangar/shared'
import type { ChartData, ChartOptions } from '../../charts/index.ts'
import { computed } from 'vue'
import { BaseChart, baseOptions, chartColors } from '../../charts/index.ts'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import HgPanel from '../HgPanel.vue'

// How each project's recent deployments ended: a quick read of which apps deploy reliably.
const props = defineProps<DashboardWidgetProps>()
const projects = computed(() => props.data.projects.value)
const withHistory = computed(() => projects.value.filter((p) => p.recent.length > 0))

const build = computed(() => () => {
  const c = chartColors()
  const base = baseOptions<'bar'>()
  const statuses = DEPLOYMENT_STATUSES.filter((s) =>
    withHistory.value.some((p) => p.recent.some((d) => d.status === s)),
  )
  const data: ChartData<'bar'> = {
    labels: withHistory.value.map((p) => p.name),
    datasets: statuses.map((status) => ({
      label: statusCopy[status].label,
      data: withHistory.value.map((p) => p.recent.filter((d) => d.status === status).length),
      backgroundColor: c.status(status),
      borderRadius: 2,
      barThickness: 14,
    })),
  }
  const options: ChartOptions<'bar'> = {
    ...base,
    indexAxis: 'y',
    plugins: {
      ...base.plugins,
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: c.muted,
          boxWidth: 10,
          boxHeight: 10,
          useBorderRadius: true,
          borderRadius: 2,
        },
      },
      tooltip: { ...base.plugins?.tooltip, displayColors: true },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: c.line },
        ticks: { color: c.muted, precision: 0 },
        border: { display: false },
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { color: c.ink },
        border: { display: false },
      },
    },
  }
  return { data, options }
})

const height = computed(() => `${Math.max(7, withHistory.value.length * 2.25 + 4)}rem`)
</script>

<template>
  <HgPanel
    title="Deployment results"
    description="How the last 12 deployments of each project ended."
  >
    <p v-if="withHistory.length === 0" class="hg-muted">
      Results appear after the first deployment.
    </p>
    <BaseChart
      v-else
      type="bar"
      :build="build"
      label="Recent deployment results per project"
      :height="height"
    />
  </HgPanel>
</template>
