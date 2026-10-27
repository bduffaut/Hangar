<script setup lang="ts">
import { instrumentsCopy, type SystemInfo } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api/client.ts'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { cleanCpuModel, formatBytes, formatUptime } from '../../lib/format.ts'
import HgPanel from '../HgPanel.vue'
import TrendLine from '../TrendLine.vue'

// The server's readings as a strip of cockpit instruments: one cell per reading, with its trend
// or a meter underneath, and the machine's fixed details on the line below.
const props = defineProps<DashboardWidgetProps>()
const samples = computed(() => props.data.metrics.value)
const info = ref<SystemInfo | null>(null)

onMounted(async () => {
  info.value = await api('systemInfo').catch(() => null)
})

const host = computed(() => samples.value.at(-1)?.host ?? null)
const percent = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)
const cpuSeries = computed(() => samples.value.map((s) => s.host.cpuPercent))
const memorySeries = computed(() =>
  samples.value.map((s) => percent(s.host.memoryUsedBytes, s.host.memoryTotalBytes)),
)
const cpuTemperature = computed(
  () => host.value?.temperatures.find((t) => t.name === 'CPU') ?? host.value?.temperatures[0],
)
const cpuTemperatureSeries = computed(() =>
  samples.value.map((s) => s.host.temperatures.find((t) => t.name === 'CPU')?.celsius ?? null),
)
const otherTemperatures = computed(
  () => host.value?.temperatures.filter((t) => t !== cpuTemperature.value) ?? [],
)
/** Hot enough to throttle on most laptops. */
const HOT_CELSIUS = 85
const diskPercent = computed(() =>
  host.value ? percent(host.value.diskUsedBytes, host.value.diskTotalBytes) : 0,
)
</script>

<template>
  <HgPanel :title="instrumentsCopy.title" data-tour="instruments">
    <template #actions>
      <span v-if="info" class="hg-muted hg-version"
        >{{ instrumentsCopy.version }} <code>{{ info.version }}</code></span
      >
    </template>
    <p v-if="!host" class="hg-muted">{{ instrumentsCopy.waiting }}</p>
    <template v-else>
      <dl class="hg-gauges">
        <div class="hg-gauge">
          <dt>{{ instrumentsCopy.cpu }}</dt>
          <dd class="hg-reading">{{ Math.round(host.cpuPercent) }}<small>%</small></dd>
          <dd class="hg-detail">{{ instrumentsCopy.load(host.loadAverage) }}</dd>
          <dd class="hg-trace">
            <TrendLine
              :values="cpuSeries"
              :max="100"
              height="2rem"
              label="CPU use over the last 15 minutes"
            />
          </dd>
        </div>

        <div class="hg-gauge">
          <dt>{{ instrumentsCopy.memory }}</dt>
          <dd class="hg-reading">
            {{ formatBytes(host.memoryUsedBytes).split(' ')[0]
            }}<small>{{ formatBytes(host.memoryUsedBytes).split(' ')[1] }}</small>
          </dd>
          <dd class="hg-detail">of {{ formatBytes(host.memoryTotalBytes) }}</dd>
          <dd class="hg-trace">
            <TrendLine
              :values="memorySeries"
              :max="100"
              height="2rem"
              color="--hg-series-1"
              label="Memory use over the last 15 minutes"
            />
          </dd>
        </div>

        <div class="hg-gauge">
          <dt>{{ instrumentsCopy.disk }}</dt>
          <dd class="hg-reading">{{ Math.round(diskPercent) }}<small>%</small></dd>
          <dd class="hg-detail">
            {{ formatBytes(host.diskUsedBytes) }} of {{ formatBytes(host.diskTotalBytes) }}
          </dd>
          <dd class="hg-trace">
            <span
              class="hg-meter"
              role="meter"
              :aria-valuenow="Math.round(diskPercent)"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Disk used"
              ><span :style="{ width: `${diskPercent}%` }"
            /></span>
          </dd>
        </div>

        <div class="hg-gauge">
          <dt>{{ instrumentsCopy.temperature }}</dt>
          <template v-if="cpuTemperature">
            <dd class="hg-reading" :class="{ 'is-hot': cpuTemperature.celsius >= HOT_CELSIUS }">
              {{ Math.round(cpuTemperature.celsius) }}<small>°C</small>
            </dd>
            <dd class="hg-detail">
              <span v-for="t in otherTemperatures" :key="t.name" class="hg-sensor"
                >{{ t.name }} {{ Math.round(t.celsius) }}°</span
              >
            </dd>
            <dd class="hg-trace">
              <TrendLine
                :values="cpuTemperatureSeries"
                height="2rem"
                color="--hg-series-2"
                label="CPU temperature over the last 15 minutes"
              />
            </dd>
          </template>
          <dd v-else class="hg-detail hg-none">{{ instrumentsCopy.noSensors }}</dd>
        </div>

        <div v-if="host.battery" class="hg-gauge">
          <dt>{{ instrumentsCopy.battery }}</dt>
          <dd class="hg-reading">{{ Math.round(host.battery.percent) }}<small>%</small></dd>
          <dd class="hg-detail">
            {{ instrumentsCopy.batteryStatus[host.battery.status] ?? host.battery.status }}
          </dd>
          <dd class="hg-trace">
            <span
              class="hg-meter is-battery"
              :class="{ 'is-low': host.battery.percent <= 20 }"
              aria-hidden="true"
              ><span :style="{ width: `${host.battery.percent}%` }"
            /></span>
          </dd>
        </div>

        <div class="hg-gauge">
          <dt>{{ instrumentsCopy.uptime }}</dt>
          <dd class="hg-reading hg-reading-text">{{ formatUptime(host.uptimeSeconds) }}</dd>
        </div>
      </dl>

      <p v-if="info" class="hg-machine">
        <span v-if="info.cpuModel">{{ cleanCpuModel(info.cpuModel) }}</span>
        <span v-if="info.cpuThreads">{{ instrumentsCopy.threads(info.cpuThreads) }}</span>
        <span v-if="info.kernel">Linux {{ info.kernel }}</span>
        <span>{{ instrumentsCopy.images(formatBytes(info.imageDiskBytes)) }}</span>
      </p>
    </template>
  </HgPanel>
</template>

<style scoped>
.hg-version {
  font-size: var(--hg-size-sm);
}
.hg-gauges {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  border-top: 1px solid var(--hg-line);
  border-bottom: 1px solid var(--hg-line);
}
/* Cells are divided like the faces on an instrument panel. */
.hg-gauge {
  display: grid;
  /* minmax(0, …): a chart sizes itself from its cell, so the cell must not size from the chart. */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto auto 1fr;
  align-content: start;
  gap: 0.15rem;
  padding: var(--hg-space-4) var(--hg-space-4) var(--hg-space-3);
  border-left: 1px solid var(--hg-line);
  min-width: 0;
}
.hg-gauge:first-child {
  border-left: 0;
  padding-left: 0;
}
.hg-gauge dt {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-gauge dd {
  margin: 0;
}
.hg-reading {
  font-family: var(--hg-data);
  font-size: 1.875rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--hg-ink);
}
.hg-reading small {
  font-size: 0.5em;
  margin-left: 0.15em;
  color: var(--hg-ink-muted);
  letter-spacing: 0;
}
.hg-reading-text {
  font-size: var(--hg-size-lg);
  padding-top: 0.45rem;
}
.hg-reading.is-hot {
  color: var(--hg-danger);
}
.hg-detail {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--hg-space-2);
  min-height: 1.2em;
}
.hg-none {
  padding-top: var(--hg-space-2);
  max-width: 16ch;
}
.hg-trace {
  align-self: end;
  padding-top: var(--hg-space-2);
}
.hg-meter {
  display: block;
  height: 0.375rem;
  margin-bottom: 0.4rem;
  background: var(--hg-raised);
  border-radius: 1px;
  overflow: hidden;
}
.hg-meter > span {
  display: block;
  height: 100%;
  background: var(--hg-ink-muted);
}
.hg-meter.is-battery > span {
  background: var(--hg-status-ready);
}
.hg-meter.is-low > span {
  background: var(--hg-danger);
}
.hg-machine {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--hg-space-5);
  row-gap: var(--hg-space-1);
  max-width: none;
  padding-top: var(--hg-space-3);
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
@media (max-width: 44rem) {
  .hg-gauges {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hg-gauge {
    border-left: 0;
    padding-left: 0;
    border-top: 1px solid var(--hg-line);
  }
  .hg-gauge:nth-child(-n + 2) {
    border-top: 0;
  }
  .hg-gauge:nth-child(even) {
    padding-left: var(--hg-space-4);
    border-left: 1px solid var(--hg-line);
  }
}
</style>
