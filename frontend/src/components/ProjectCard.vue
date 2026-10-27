<script setup lang="ts">
import type { ProjectView } from '@hangar/shared'
import { computed } from 'vue'
import { useNow } from '../composables/useNow.ts'
import { formatBytes, relativeTime, shortSha } from '../lib/format.ts'
import { useMetricsStore } from '../stores/metrics.ts'
import { BaseIcon } from '../ui/index.ts'
import RunwayLights from './RunwayLights.vue'
import TrendLine from './TrendLine.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ project: ProjectView }>()
const metrics = useMetricsStore()
const now = useNow()

const series = computed(() => metrics.seriesFor(props.project.id))
const memory = computed(() => series.value.map((p) => p.value?.memoryUsedBytes ?? null))
const cpu = computed(() => series.value.map((p) => p.value?.cpuPercent ?? null))
const latestMemory = computed(() => memory.value.findLast((v) => v !== null) ?? null)
const latestCpu = computed(() => cpu.value.findLast((v) => v !== null) ?? null)
const memoryLimit = computed(() => props.project.memoryLimitMb * 1024 * 1024)
const stopped = computed(() => props.project.desiredState === 'stopped')
const latest = computed(() => props.project.latest)
</script>

<template>
  <article class="hg-project" :data-project="project.name">
    <header class="hg-project-header">
      <h3 class="hg-project-name">
        <RouterLink :to="{ name: 'project', params: { name: project.name } }">{{
          project.name
        }}</RouterLink>
      </h3>
      <StatusBadge v-if="latest" :status="latest.status" size="sm" />
    </header>

    <a
      v-if="project.url && project.current && !stopped"
      class="hg-project-url"
      :href="project.url"
      target="_blank"
      rel="noopener"
    >
      {{ project.url.replace(/^https?:\/\//, '') }}
      <BaseIcon name="external" :size="14" />
    </a>
    <p v-else class="hg-muted hg-project-url">{{ stopped ? 'Stopped' : 'Not deployed yet' }}</p>

    <RunwayLights :recent="project.recent" />

    <footer class="hg-project-footer">
      <p v-if="latest" class="hg-project-commit">
        <code>{{ shortSha(latest.commitSha) }}</code>
        <span class="hg-project-message">{{
          latest.commitMessage ?? 'Waiting for commit details'
        }}</span>
        <span class="hg-muted">{{ relativeTime(latest.createdAt, now) }}</span>
      </p>
      <div v-if="project.current && !stopped" class="hg-project-memory">
        <template v-if="latestMemory !== null">
          <div class="hg-project-gauge">
            <TrendLine
              :values="memory"
              :max="memoryLimit"
              :label="`${project.name} memory use`"
              color="--hg-series-1"
              height="2rem"
            />
            <span class="hg-muted"
              >Memory {{ formatBytes(latestMemory) }} of {{ project.memoryLimitMb }} MB</span
            >
          </div>
          <div class="hg-project-gauge">
            <TrendLine
              :values="cpu"
              :label="`${project.name} CPU use`"
              color="--hg-series-0"
              height="2rem"
            />
            <span class="hg-muted">CPU {{ Math.round(latestCpu ?? 0) }}%</span>
          </div>
        </template>
        <span v-else class="hg-muted">Reading memory use…</span>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.hg-project {
  display: grid;
  gap: var(--hg-space-3);
  padding: var(--hg-space-4) var(--hg-space-5) var(--hg-space-5);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-lg);
  min-width: 0;
}
.hg-project:focus-within {
  border-color: var(--hg-accent);
}
.hg-project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--hg-space-2);
}
.hg-project-name {
  font-size: var(--hg-size-md);
  min-width: 0;
  overflow-wrap: anywhere;
}
.hg-project-name a {
  color: inherit;
  text-decoration: none;
}
.hg-project-name a::after {
  content: '';
  position: absolute;
  inset: 0;
}
.hg-project {
  position: relative;
}
.hg-project-url {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  font-size: var(--hg-size-sm);
  overflow-wrap: anywhere;
}
.hg-project-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--hg-space-3);
}
.hg-project-commit {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--hg-space-2);
  align-items: baseline;
  font-size: var(--hg-size-sm);
}
.hg-project-message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-project-memory {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--hg-space-3);
  font-size: var(--hg-size-xs);
}
.hg-project-memory > .hg-muted {
  grid-column: 1 / -1;
}
.hg-project-gauge {
  display: grid;
  gap: var(--hg-space-1);
  min-width: 0;
}
</style>
