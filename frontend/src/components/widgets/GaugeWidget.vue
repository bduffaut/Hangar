<script setup lang="ts">
import { instrumentsCopy, type MetricsSample } from '@hangar/shared'
import { computed } from 'vue'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { formatBytes, formatUptime } from '../../lib/format.ts'
import TrendLine from '../TrendLine.vue'

// One server reading as an engine instrument: the value, its trend over the last 15 minutes, and
// a scale marked with its caution and warning ranges, the way engine gauges carry amber and red
// arcs. The reading turns amber or red when it enters them.
export type Reading = 'cpu' | 'memory' | 'disk' | 'temperature' | 'battery' | 'uptime'

const props = defineProps<DashboardWidgetProps & { reading: Reading }>()

type Host = MetricsSample['host']
interface Instrument {
  value: (h: Host) => number | null
  unit: string
  min: number
  max: number
  /** Where the caution and warning ranges start. Below them when `lowIsBad`. */
  caution: number
  warning: number
  lowIsBad?: boolean
  detail: (h: Host) => string
  trend?: boolean
}

const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)
const cpuTemp = (h: Host) =>
  (h.temperatures.find((t) => t.name === 'CPU') ?? h.temperatures[0])?.celsius ?? null

const instruments: Record<Exclude<Reading, 'uptime'>, Instrument> = {
  cpu: {
    value: (h) => h.cpuPercent,
    unit: '%',
    min: 0,
    max: 100,
    caution: 80,
    warning: 95,
    detail: (h) => instrumentsCopy.load(h.loadAverage),
    trend: true,
  },
  memory: {
    value: (h) => pct(h.memoryUsedBytes, h.memoryTotalBytes),
    unit: '%',
    min: 0,
    max: 100,
    caution: 85,
    warning: 95,
    detail: (h) => `${formatBytes(h.memoryUsedBytes)} of ${formatBytes(h.memoryTotalBytes)}`,
    trend: true,
  },
  disk: {
    value: (h) => pct(h.diskUsedBytes, h.diskTotalBytes),
    unit: '%',
    min: 0,
    max: 100,
    caution: 80,
    warning: 90,
    detail: (h) => `${formatBytes(h.diskUsedBytes)} of ${formatBytes(h.diskTotalBytes)}`,
  },
  temperature: {
    value: cpuTemp,
    unit: '°C',
    min: 20,
    max: 100,
    caution: 80,
    warning: 90,
    detail: (h) =>
      h.temperatures
        .filter((t) => t.name !== 'CPU')
        .slice(0, 2)
        .map((t) => `${t.name} ${Math.round(t.celsius)}°`)
        .join(', '),
    trend: true,
  },
  battery: {
    value: (h) => h.battery?.percent ?? null,
    unit: '%',
    min: 0,
    max: 100,
    caution: 20,
    warning: 10,
    lowIsBad: true,
    detail: (h) =>
      h.battery ? (instrumentsCopy.batteryStatus[h.battery.status] ?? h.battery.status) : '',
  },
}

const samples = computed(() => props.data.metrics.value)
const host = computed(() => samples.value.at(-1)?.host ?? null)
const instrument = computed(() => (props.reading === 'uptime' ? null : instruments[props.reading]))
const value = computed(() =>
  host.value && instrument.value ? instrument.value.value(host.value) : null,
)
const detail = computed(() =>
  host.value && instrument.value ? instrument.value.detail(host.value) : '',
)
const series = computed(() =>
  instrument.value?.trend ? samples.value.map((s) => instrument.value!.value(s.host)) : [],
)

const range = computed<'normal' | 'caution' | 'warning'>(() => {
  const i = instrument.value
  const v = value.value
  if (!i || v === null) return 'normal'
  if (i.lowIsBad) return v <= i.warning ? 'warning' : v <= i.caution ? 'caution' : 'normal'
  return v >= i.warning ? 'warning' : v >= i.caution ? 'caution' : 'normal'
})

/** Position on the scale, 0 to 100. */
const at = (v: number) => {
  const i = instrument.value!
  return Math.min(100, Math.max(0, ((v - i.min) / (i.max - i.min)) * 100))
}
const bands = computed(() => {
  const i = instrument.value
  if (!i) return null
  return i.lowIsBad
    ? { caution: [at(i.warning), at(i.caution)], warning: [0, at(i.warning)] }
    : { caution: [at(i.caution), at(i.warning)], warning: [at(i.warning), 100] }
})

const missing = computed(() => {
  if (props.reading === 'temperature') return instrumentsCopy.noSensors
  if (props.reading === 'battery') return 'This machine has no battery.'
  return instrumentsCopy.waiting
})
const trendLabel = computed(() => `${props.reading} over the last 15 minutes`)
</script>

<template>
  <div class="hg-gauge" :class="`is-${range}`">
    <p v-if="!host" class="hg-gauge-missing">{{ instrumentsCopy.waiting }}</p>

    <template v-else-if="reading === 'uptime'">
      <p class="hg-gauge-reading is-text">{{ formatUptime(host.uptimeSeconds) }}</p>
      <p class="hg-gauge-detail">
        since
        {{
          new Date(Date.now() - host.uptimeSeconds * 1000).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
        }}
      </p>
    </template>

    <p v-else-if="value === null" class="hg-gauge-missing">{{ missing }}</p>

    <template v-else>
      <p class="hg-gauge-reading">
        {{ Math.round(value) }}<small>{{ instrument!.unit }}</small>
      </p>
      <p class="hg-gauge-detail">{{ detail }}</p>
      <div class="hg-gauge-trend">
        <TrendLine
          v-if="instrument!.trend"
          :values="series"
          :max="instrument!.max"
          height="100%"
          :color="
            range === 'normal'
              ? '--hg-series-1'
              : `--hg-${range === 'caution' ? 'caution' : 'danger'}`
          "
          :label="trendLabel"
        />
      </div>
      <div
        class="hg-gauge-scale"
        role="meter"
        :aria-valuenow="Math.round(value)"
        :aria-valuemin="instrument!.min"
        :aria-valuemax="instrument!.max"
        :aria-label="reading"
      >
        <span
          class="hg-band is-caution"
          :style="{
            left: `${bands!.caution[0]}%`,
            width: `${bands!.caution[1]! - bands!.caution[0]!}%`,
          }"
        />
        <span
          class="hg-band is-warning"
          :style="{
            left: `${bands!.warning[0]}%`,
            width: `${bands!.warning[1]! - bands!.warning[0]!}%`,
          }"
        />
        <span class="hg-fill" :style="{ width: `${at(value)}%` }" />
        <span class="hg-pointer" :style="{ left: `${at(value)}%` }" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.hg-gauge {
  --tone: var(--hg-ink);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 var(--hg-space-4) var(--hg-space-4);
}
.is-caution {
  --tone: var(--hg-caution);
}
.is-warning {
  --tone: var(--hg-danger);
}
.hg-gauge-reading {
  font-family: var(--hg-data);
  font-size: 2rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--tone);
  transition: color var(--hg-motion-base) var(--hg-motion-easing);
}
.hg-gauge-reading small {
  font-size: 0.45em;
  margin-left: 0.2em;
  color: var(--hg-ink-muted);
  letter-spacing: 0;
}
.hg-gauge-reading.is-text {
  font-size: var(--hg-size-lg);
  padding-top: var(--hg-space-2);
}
.hg-gauge-detail {
  min-height: 1.2em;
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hg-gauge-missing {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
.hg-gauge-trend {
  flex: 1;
  min-height: 0;
  margin: var(--hg-space-2) 0;
}
/* The scale: a hairline track with amber and red ranges, filled up to the pointer. */
.hg-gauge-scale {
  position: relative;
  height: 6px;
  flex: none;
  background: var(--hg-raised);
  border-radius: 1px;
}
.hg-band {
  position: absolute;
  top: 0;
  bottom: 0;
}
.hg-band.is-caution {
  background: color-mix(in srgb, var(--hg-caution) 45%, transparent);
}
.hg-band.is-warning {
  background: color-mix(in srgb, var(--hg-danger) 55%, transparent);
}
.hg-fill {
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  background: var(--tone);
  opacity: 0.85;
  transition: width 600ms var(--hg-motion-easing);
}
.hg-pointer {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--tone);
  transition: left 600ms var(--hg-motion-easing);
}
</style>
