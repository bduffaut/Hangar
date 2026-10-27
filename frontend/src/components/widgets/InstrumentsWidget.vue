<script setup lang="ts">
import { instrumentsCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api/client.ts'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { formatBytes } from '../../lib/format.ts'
import GaugeDial from '../GaugeDial.vue'
import HgPanel from '../HgPanel.vue'
import TrendLine from '../TrendLine.vue'

const props = defineProps<DashboardWidgetProps>()
const samples = computed(() => props.data.metrics.value)
const info = ref<{ version: string; imageDiskBytes: number } | null>(null)

onMounted(async () => {
  info.value = await api('systemInfo').catch(() => null)
})

const host = computed(() => samples.value.at(-1)?.host ?? null)
const percent = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0)
const cpuSeries = computed(() => samples.value.map((s) => s.host.cpuPercent))
const memorySeries = computed(() =>
  samples.value.map((s) => percent(s.host.memoryUsedBytes, s.host.memoryTotalBytes)),
)
</script>

<template>
  <HgPanel :title="instrumentsCopy.title" data-tour="instruments">
    <template #actions>
      <span v-if="info" class="hg-muted hg-version"
        >{{ instrumentsCopy.version }} {{ info.version }}</span
      >
    </template>
    <p v-if="!host" class="hg-muted">{{ instrumentsCopy.waiting }}</p>
    <div v-else class="hg-instruments">
      <GaugeDial
        :percent="host.cpuPercent"
        :caption="instrumentsCopy.cpu"
        :label="`${Math.round(host.cpuPercent)}% busy`"
        detail="Across all cores"
      />
      <GaugeDial
        :percent="percent(host.memoryUsedBytes, host.memoryTotalBytes)"
        :caption="instrumentsCopy.memory"
        :label="`${formatBytes(host.memoryUsedBytes)} used`"
        :detail="`${formatBytes(host.memoryUsedBytes)} of ${formatBytes(host.memoryTotalBytes)}`"
      />
      <GaugeDial
        :percent="percent(host.diskUsedBytes, host.diskTotalBytes)"
        :caption="instrumentsCopy.disk"
        :label="`${formatBytes(host.diskUsedBytes)} used`"
        :detail="`${formatBytes(host.diskUsedBytes)} of ${formatBytes(host.diskTotalBytes)}${info ? `, ${formatBytes(info.imageDiskBytes)} app images` : ''}`"
      />
      <div class="hg-trends">
        <div class="hg-trend">
          <span>{{ instrumentsCopy.cpu }}, last 15 min</span>
          <TrendLine :values="cpuSeries" :max="100" label="CPU use over the last 15 minutes" />
        </div>
        <div class="hg-trend">
          <span>{{ instrumentsCopy.memory }}, last 15 min</span>
          <TrendLine
            :values="memorySeries"
            :max="100"
            label="Memory use over the last 15 minutes"
            color="--hg-series-1"
          />
        </div>
      </div>
    </div>
  </HgPanel>
</template>

<style scoped>
.hg-instruments {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.6fr);
  gap: var(--hg-space-5);
  align-items: center;
}
.hg-trends {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-trend {
  display: grid;
  gap: var(--hg-space-1);
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
.hg-version {
  font-size: var(--hg-size-sm);
}
@media (max-width: 52rem) {
  .hg-instruments {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    /* Captions wrap to different heights on narrow screens; keep the dials in one line. */
    align-items: start;
  }
  .hg-trends {
    grid-column: 1 / -1;
  }
}
</style>
