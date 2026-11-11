<script setup lang="ts">
import { deckCopy, type FlightStats, navCopy } from '@hangar/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api/client.ts'
import { formatDuration, formatUptime } from '../lib/format.ts'
import { useLiveStore } from '../stores/live.ts'
import { useMetricsStore } from '../stores/metrics.ts'
import { useProjectsStore } from '../stores/projects.ts'
import { useServersStore } from '../stores/servers.ts'
import BarSpark from './BarSpark.vue'

// The top of the home screen: which server this is, its live readings, and how the last weeks of
// deploys went. The one bold element on the page; the board below stays quiet.
const servers = useServersStore()
const metrics = useMetricsStore()
const projects = useProjectsStore()
const live = useLiveStore()

const stats = ref<FlightStats | null>(null)
async function loadStats() {
  stats.value = await api('flightStats').catch(() => stats.value)
}
let unsubscribe: (() => void) | null = null
onMounted(() => {
  metrics.acquire()
  void loadStats()
  // A finished deploy changes the numbers.
  unsubscribe = live.onDeployment((d) => {
    if (d.status === 'ready' || d.status === 'failed') void loadStats()
  }) as () => void
})
onBeforeUnmount(() => {
  metrics.release()
  unsubscribe?.()
})

const name = computed(() =>
  servers.isLocal ? navCopy.thisServer : (servers.remote?.name ?? navCopy.noServer),
)
const online = computed(() => servers.isLocal || (servers.remote?.online ?? false))
const machine = computed(() => {
  const info = servers.remote?.info
  if (info) return `${info.hostname}, ${info.os}`
  return servers.isLocal ? window.location.hostname : ''
})

const host = computed(() => metrics.latest?.host ?? null)
const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)
const series = (pick: (h: NonNullable<typeof host.value>) => number) =>
  metrics.samples.map((s) => (s.host ? pick(s.host) : null))

const readings = computed(() => {
  const h = host.value
  return [
    {
      key: 'cpu',
      label: deckCopy.readings.cpu,
      value: h ? Math.round(h.cpuPercent) : null,
      unit: '%',
      series: series((x) => x.cpuPercent),
      warn: (h?.cpuPercent ?? 0) >= 85,
    },
    {
      key: 'memory',
      label: deckCopy.readings.memory,
      value: h ? Math.round(pct(h.memoryUsedBytes, h.memoryTotalBytes)) : null,
      unit: '%',
      series: series((x) => pct(x.memoryUsedBytes, x.memoryTotalBytes)),
      warn: h ? pct(h.memoryUsedBytes, h.memoryTotalBytes) >= 90 : false,
    },
    {
      key: 'disk',
      label: deckCopy.readings.disk,
      value: h ? Math.round(pct(h.diskUsedBytes, h.diskTotalBytes)) : null,
      unit: '%',
      series: series((x) => pct(x.diskUsedBytes, x.diskTotalBytes)),
      warn: h ? pct(h.diskUsedBytes, h.diskTotalBytes) >= 85 : false,
    },
  ]
})
const uptime = computed(() => (host.value ? formatUptime(host.value.uptimeSeconds) : null))

const appsLive = computed(
  () => projects.projects.filter((p) => p.current && p.desiredState === 'running').length,
)
const successRate = computed(() => {
  const s = stats.value
  if (!s || s.ready7d + s.failed7d === 0) return null
  return Math.round((s.ready7d / (s.ready7d + s.failed7d)) * 100)
})
const dayMax = computed(() =>
  Math.max(1, ...(stats.value?.days ?? []).map((d) => d.ready + d.failed)),
)
</script>

<template>
  <section class="hg-deck hg-notched" aria-label="This server" data-tour="deck">
    <header class="hg-deck-id">
      <span class="hg-live-dot" :class="{ 'is-off': !online }" aria-hidden="true" />
      <div class="hg-deck-name">
        <h1>{{ name }}</h1>
        <p class="hg-muted">{{ machine }}</p>
      </div>
      <p v-if="!online" class="hg-deck-offline" role="status">{{ deckCopy.offline }}</p>
    </header>

    <div class="hg-deck-readings">
      <div v-for="r in readings" :key="r.key" class="hg-reading" :class="{ 'is-warn': r.warn }">
        <span class="hg-reading-label">{{ r.label }}</span>
        <span class="hg-reading-value">
          <template v-if="r.value !== null"
            >{{ r.value }}<small>{{ r.unit }}</small></template
          >
          <span v-else class="hg-muted hg-reading-wait">{{ deckCopy.waiting }}</span>
        </span>
        <BarSpark :values="r.series" :max="100" />
      </div>
      <div class="hg-reading">
        <span class="hg-reading-label">{{ deckCopy.readings.uptime }}</span>
        <span class="hg-reading-value hg-reading-text">{{ uptime ?? deckCopy.waiting }}</span>
      </div>
    </div>

    <div class="hg-deck-stats">
      <dl class="hg-stat">
        <dt>{{ deckCopy.stats.live }}</dt>
        <dd>
          {{ appsLive }}<small> of {{ projects.projects.length }}</small>
        </dd>
      </dl>
      <dl class="hg-stat">
        <dt>{{ deckCopy.stats.deploys }}</dt>
        <dd>{{ stats?.deploys7d ?? '–' }}</dd>
      </dl>
      <dl class="hg-stat">
        <dt>{{ deckCopy.stats.success }}</dt>
        <dd>
          <template v-if="successRate !== null">{{ successRate }}<small>%</small></template>
          <span v-else class="hg-muted hg-stat-none">{{ deckCopy.stats.noData }}</span>
        </dd>
      </dl>
      <dl class="hg-stat">
        <dt>{{ deckCopy.stats.median }}</dt>
        <dd>
          <template v-if="stats?.medianDeploySeconds != null">{{
            formatDuration(stats.medianDeploySeconds * 1000)
          }}</template>
          <span v-else class="hg-muted hg-stat-none">{{ deckCopy.stats.noData }}</span>
        </dd>
      </dl>
      <figure class="hg-history" :aria-label="deckCopy.history">
        <div class="hg-history-bars">
          <span
            v-for="day in stats?.days ?? []"
            :key="day.date"
            :title="`${day.date}: ${day.ready} live, ${day.failed} failed`"
          >
            <i class="is-failed" :style="{ height: `${(day.failed / dayMax) * 100}%` }" /><i
              class="is-ready"
              :style="{ height: `${(day.ready / dayMax) * 100}%` }"
            />
          </span>
        </div>
        <figcaption>{{ deckCopy.history }}</figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.hg-deck {
  --hg-notch: 18px;
  --hg-notch-line: color-mix(in srgb, var(--hg-accent) 70%, var(--hg-line));
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) minmax(0, 2.4fr);
  margin-bottom: var(--hg-space-5);
  background: color-mix(in srgb, var(--hg-panel) 94%, transparent);
  border: 1px solid var(--hg-line);
  border-top: 2px solid var(--hg-accent);
}
.hg-deck-id {
  display: flex;
  align-items: flex-start;
  gap: var(--hg-space-3);
  flex-wrap: wrap;
  padding: var(--hg-space-5);
  border-right: 1px solid var(--hg-line);
}
.hg-deck-id .hg-live-dot {
  margin-top: 0.75rem;
}
.hg-deck-name {
  display: grid;
  gap: var(--hg-space-1);
  min-width: 0;
  flex: 1;
}
.hg-deck-name h1 {
  font-size: clamp(1.6rem, 2.6vw, 2.25rem);
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}
.hg-deck-name p {
  font-size: var(--hg-size-sm);
  overflow-wrap: anywhere;
}
.hg-deck-offline {
  flex-basis: 100%;
  font-size: var(--hg-size-sm);
  color: var(--hg-caution);
}

.hg-deck-readings {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.hg-reading {
  display: grid;
  align-content: start;
  gap: var(--hg-space-2);
  padding: var(--hg-space-4) var(--hg-space-5);
  border-right: 1px solid color-mix(in srgb, var(--hg-line) 70%, transparent);
}
.hg-reading:last-child {
  border-right: 0;
}
.hg-reading-label {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-reading-value {
  font-size: 2.1rem;
  line-height: 1;
  font-weight: var(--hg-weight-bold);
  letter-spacing: -0.03em;
}
.hg-reading-value small {
  font-size: 0.5em;
  font-weight: var(--hg-weight-regular);
  color: var(--hg-ink-muted);
  margin-left: 0.1em;
}
.hg-reading-text {
  font-size: 1.35rem;
  line-height: 1.55;
}
.hg-reading-wait {
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-regular);
  letter-spacing: 0;
}
.is-warn .hg-reading-value {
  color: var(--hg-caution);
}

.hg-deck-stats {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(12rem, 1.6fr);
  border-top: 1px solid var(--hg-line);
}
.hg-stat {
  margin: 0;
  display: grid;
  align-content: start;
  gap: var(--hg-space-1);
  padding: var(--hg-space-4) var(--hg-space-5);
  border-right: 1px solid color-mix(in srgb, var(--hg-line) 70%, transparent);
}
.hg-stat dt {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-stat dd {
  margin: 0;
  font-size: var(--hg-size-xl);
  font-weight: var(--hg-weight-bold);
  letter-spacing: -0.02em;
}
.hg-stat dd small {
  font-size: 0.55em;
  font-weight: var(--hg-weight-regular);
  color: var(--hg-ink-muted);
}
.hg-stat-none {
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-regular);
  letter-spacing: 0;
}
.hg-history {
  margin: 0;
  display: grid;
  gap: var(--hg-space-2);
  padding: var(--hg-space-4) var(--hg-space-5);
}
.hg-history-bars {
  display: flex;
  align-items: stretch;
  gap: 3px;
  height: 2.4rem;
}
.hg-history-bars span {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: color-mix(in srgb, var(--hg-line) 45%, transparent);
}
.hg-history-bars i {
  display: block;
}
.hg-history-bars .is-ready {
  background: var(--hg-status-ready);
}
.hg-history-bars .is-failed {
  background: var(--hg-status-failed);
}
.hg-history figcaption {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}

@media (max-width: 64rem) {
  .hg-deck {
    grid-template-columns: 1fr;
  }
  .hg-deck-id {
    border-right: 0;
    border-bottom: 1px solid var(--hg-line);
  }
  .hg-deck-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hg-history {
    grid-column: 1 / -1;
    border-top: 1px solid color-mix(in srgb, var(--hg-line) 70%, transparent);
  }
}
@media (max-width: 40rem) {
  .hg-deck-readings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hg-reading:nth-child(2) {
    border-right: 0;
  }
  .hg-reading:nth-child(-n + 2) {
    border-bottom: 1px solid color-mix(in srgb, var(--hg-line) 70%, transparent);
  }
  .hg-reading,
  .hg-stat,
  .hg-history,
  .hg-deck-id {
    padding: var(--hg-space-3) var(--hg-space-4);
  }
  .hg-reading-value {
    font-size: 1.7rem;
  }
}
</style>
