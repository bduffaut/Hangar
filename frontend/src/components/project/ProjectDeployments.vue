<script setup lang="ts">
import {
  confirmCopy,
  type DeploymentView,
  emptyCopy,
  type ProjectView,
  statusCopy,
  toastCopy,
  triggerCopy,
} from '@hangar/shared'
import type { ChartData, ChartOptions } from 'chart.js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api, messageOf } from '../../api/client.ts'
import { BaseChart, baseOptions, chartColors, withAlpha } from '../../charts/index.ts'
import { useNow } from '../../composables/useNow.ts'
import {
  deploymentDuration,
  formatBytes,
  formatDuration,
  relativeTime,
  shortSha,
} from '../../lib/format.ts'
import { useLiveStore } from '../../stores/live.ts'
import { useMetricsStore } from '../../stores/metrics.ts'
import { BaseButton, useConfirmAction, useNotify } from '../../ui/index.ts'
import EmptyState from '../EmptyState.vue'
import HgPanel from '../HgPanel.vue'
import StatusBadge from '../StatusBadge.vue'

const props = defineProps<{ project: ProjectView }>()
const live = useLiveStore()
const metrics = useMetricsStore()
const notify = useNotify()
const confirm = useConfirmAction()
const now = useNow(1000)

const deployments = ref<DeploymentView[]>([])
const loaded = ref(false)

async function load() {
  deployments.value = await api('listDeployments', {
    params: { id: props.project.id },
    query: { limit: 30 },
  })
  loaded.value = true
}

const stop = live.onDeployment((d) => {
  if (d.projectId !== props.project.id) return
  const index = deployments.value.findIndex((x) => x.id === d.id)
  if (index === -1) deployments.value = [d, ...deployments.value]
  else deployments.value.splice(index, 1, d)
  // A new live deployment changes which one is current.
  if (d.isCurrent)
    deployments.value = deployments.value.map((x) => ({ ...x, isCurrent: x.id === d.id }))
})
onMounted(() => {
  void load()
  metrics.acquire()
})
onBeforeUnmount(() => {
  stop()
  metrics.release()
})

async function rollback(d: DeploymentView) {
  if (!(await confirm(confirmCopy.rollback))) return
  try {
    await api('rollbackDeployment', { params: { id: d.id } })
    notify.success(toastCopy.rollbackQueued, `Back to #${d.number}`)
  } catch (e) {
    notify.error(messageOf(e))
  }
}

// Build time per deployment, oldest first, colored by how it ended.
const timed = computed(() =>
  [...deployments.value].reverse().filter((d) => d.startedAt && d.trigger !== 'rollback'),
)
const buildTimes = computed(() => () => {
  const c = chartColors()
  const base = baseOptions<'bar'>()
  const data: ChartData<'bar'> = {
    labels: timed.value.map((d) => `#${d.number}`),
    datasets: [
      {
        data: timed.value.map((d) => (deploymentDuration(d, now.value) ?? 0) / 1000),
        backgroundColor: timed.value.map((d) => c.status(d.status)),
        borderRadius: 3,
        maxBarThickness: 22,
      },
    ],
  }
  const options: ChartOptions<'bar'> = {
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          label: (ctx) => {
            const d = timed.value[ctx.dataIndex]!
            return `${formatDuration((ctx.parsed.y ?? 0) * 1000)}, ${statusCopy[d.status].label}`
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.muted }, border: { color: c.line } },
      y: {
        grid: { color: c.line },
        border: { display: false },
        ticks: { color: c.muted, callback: (v) => formatDuration(Number(v) * 1000) },
      },
    },
  }
  return { data, options }
})

// CPU and memory of the running container over the last 15 minutes.
const series = computed(() => metrics.seriesFor(props.project.id))
const hasResources = computed(() => series.value.some((p) => p.value !== null))
const latestResources = computed(
  () => series.value.findLast((p) => p.value !== null)?.value ?? null,
)
// Scale to what the app uses (with headroom), so a small app is not a flat line at the bottom.
const memoryScale = computed(() => {
  const peak = Math.max(
    0,
    ...series.value.map((p) => (p.value?.memoryUsedBytes ?? 0) / 1024 / 1024),
  )
  return Math.min(props.project.memoryLimitMb, Math.max(32, Math.ceil(peak * 1.5)))
})
const resources = computed(() => () => {
  const c = chartColors()
  const base = baseOptions<'line'>()
  const mb = (bytes: number | undefined) => (bytes === undefined ? null : bytes / 1024 / 1024)
  const data: ChartData<'line'> = {
    labels: series.value.map((p) =>
      new Date(p.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    ),
    datasets: [
      {
        label: 'Memory (MB)',
        data: series.value.map((p) => mb(p.value?.memoryUsedBytes)),
        borderColor: c.series[1],
        backgroundColor: withAlpha(c.series[1]!, 0.12),
        fill: true,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'memory',
      },
      {
        label: 'CPU (%)',
        data: series.value.map((p) => p.value?.cpuPercent ?? null),
        borderColor: c.accent,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'cpu',
      },
    ],
  }
  const options: ChartOptions<'line'> = {
    ...base,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      ...base.plugins,
      legend: {
        display: true,
        position: 'bottom',
        labels: { color: c.muted, boxWidth: 10, boxHeight: 2 },
      },
      tooltip: { ...base.plugins?.tooltip, displayColors: true },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: c.muted, maxTicksLimit: 5, maxRotation: 0 },
        border: { color: c.line },
      },
      memory: {
        position: 'left',
        min: 0,
        max: memoryScale.value,
        grid: { color: c.line },
        border: { display: false },
        ticks: { color: c.muted, callback: (v) => `${v} MB` },
      },
      cpu: {
        position: 'right',
        min: 0,
        suggestedMax: 100,
        grid: { display: false },
        border: { display: false },
        ticks: { color: c.muted, callback: (v) => `${v}%` },
      },
    },
  }
  return { data, options }
})
</script>

<template>
  <div class="hg-deployments">
    <div class="hg-charts">
      <HgPanel title="Build times" description="How long each build took, colored by result.">
        <p v-if="timed.length === 0" class="hg-muted">Build times appear after the first build.</p>
        <BaseChart
          v-else
          type="bar"
          :build="buildTimes"
          label="Build time per deployment"
          height="11rem"
        />
      </HgPanel>
      <HgPanel title="Resources" description="CPU and memory of the running app, last 15 minutes.">
        <p v-if="!hasResources" class="hg-muted">Collecting samples from the running app…</p>
        <p v-else-if="latestResources" class="hg-resources-now">
          Now: {{ formatBytes(latestResources.memoryUsedBytes) }} of {{ project.memoryLimitMb }} MB
          memory, {{ Math.round(latestResources.cpuPercent) }}% CPU
        </p>
        <BaseChart
          v-else
          type="line"
          :build="resources"
          label="CPU and memory use over the last 15 minutes"
          height="11rem"
        />
      </HgPanel>
    </div>

    <HgPanel title="History" :padded="false">
      <EmptyState
        v-if="loaded && deployments.length === 0"
        class="hg-history-empty"
        :title="emptyCopy.deployments.title"
        :body="emptyCopy.deployments.body"
      />
      <div v-else class="hg-table-wrap">
        <table class="hg-table">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Deployment</th>
              <th scope="col" title="The short commit ID">Tail number</th>
              <th scope="col">Duration</th>
              <th scope="col">When</th>
              <th scope="col"><span class="hg-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in deployments" :key="d.id" :class="{ 'is-current': d.isCurrent }">
              <td><StatusBadge :status="d.status" size="sm" /></td>
              <td class="hg-cell-main">
                <RouterLink :to="{ name: 'deployment', params: { id: d.id } }"
                  >#{{ d.number }}</RouterLink
                >
                <span v-if="d.isCurrent" class="hg-current">Current</span>
                <span class="hg-cell-message">{{ d.commitMessage ?? triggerCopy[d.trigger] }}</span>
                <span class="hg-muted hg-cell-sub"
                  >{{ triggerCopy[d.trigger]
                  }}{{ d.commitAuthor ? `, ${d.commitAuthor}` : '' }}</span
                >
              </td>
              <td>
                <code>{{ shortSha(d.commitSha) }}</code>
              </td>
              <td class="hg-muted">
                {{
                  deploymentDuration(d, now) === null
                    ? '–'
                    : formatDuration(deploymentDuration(d, now)!)
                }}
              </td>
              <td class="hg-muted" :title="new Date(d.createdAt).toLocaleString()">
                {{ relativeTime(d.createdAt, now) }}
              </td>
              <td class="hg-cell-actions">
                <BaseButton
                  v-if="d.status === 'ready' && !d.isCurrent"
                  size="sm"
                  variant="ghost"
                  icon="rewind"
                  label="Rollback"
                  @click="rollback(d)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </HgPanel>
  </div>
</template>

<style scoped>
.hg-deployments {
  display: grid;
  gap: var(--hg-space-5);
}
.hg-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--hg-space-5);
}
.hg-resources-now {
  font-size: var(--hg-size-sm);
  margin-bottom: var(--hg-space-3);
}
.hg-history-empty {
  padding: var(--hg-space-5);
}
.hg-table-wrap {
  overflow-x: auto;
}
.hg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--hg-size-sm);
}
.hg-table th {
  text-align: left;
  font-weight: var(--hg-weight-medium);
  color: var(--hg-ink-muted);
  padding: var(--hg-space-2) var(--hg-space-4);
  border-bottom: 1px solid var(--hg-line);
  white-space: nowrap;
}
.hg-table td {
  padding: var(--hg-space-3) var(--hg-space-4);
  border-bottom: 1px solid var(--hg-line);
  vertical-align: middle;
  white-space: nowrap;
}
.hg-table tr:last-child td {
  border-bottom: 0;
}
.hg-table tr.is-current td {
  background: color-mix(in srgb, var(--hg-status-ready) 6%, transparent);
}
.hg-cell-main {
  display: grid;
  grid-template-columns: auto auto 1fr;
  column-gap: var(--hg-space-2);
  white-space: normal;
  min-width: 14rem;
}
.hg-cell-message {
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 28rem;
}
.hg-cell-sub {
  grid-column: 1 / -1;
  font-size: var(--hg-size-xs);
}
.hg-current {
  font-size: var(--hg-size-xs);
  color: var(--hg-status-ready);
  font-weight: var(--hg-weight-medium);
}
.hg-cell-actions {
  text-align: right;
}
@media (max-width: 52rem) {
  .hg-charts {
    grid-template-columns: 1fr;
  }
}
/* On phones each deployment becomes a compact stacked row instead of a wide table. */
@media (max-width: 40rem) {
  .hg-table thead {
    display: none;
  }
  .hg-table tr {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--hg-space-1) var(--hg-space-3);
    align-items: center;
    padding: var(--hg-space-3) var(--hg-space-4);
    border-bottom: 1px solid var(--hg-line);
  }
  .hg-table td {
    padding: 0;
    border: 0;
  }
  .hg-table td:nth-child(2) {
    grid-column: 1 / -1;
    grid-row: 2;
    min-width: 0;
  }
  .hg-table td:nth-child(3),
  .hg-table td:nth-child(4) {
    display: none;
  }
  .hg-cell-message {
    max-width: none;
  }
}
</style>
