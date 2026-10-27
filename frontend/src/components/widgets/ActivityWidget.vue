<script setup lang="ts">
import { triggerCopy } from '@hangar/shared'
import { computed } from 'vue'
import { useNow } from '../../composables/useNow.ts'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { relativeTime, shortSha } from '../../lib/format.ts'
import HgPanel from '../HgPanel.vue'
import StatusBadge from '../StatusBadge.vue'

// The newest deployment of every project, most recent first: what happened lately.
const props = defineProps<DashboardWidgetProps>()
const projects = computed(() => props.data.projects.value)
const now = useNow()

const rows = computed(() =>
  projects.value
    .flatMap((p) => (p.latest ? [{ project: p.name, deployment: p.latest }] : []))
    .sort((a, b) => b.deployment.createdAt.localeCompare(a.deployment.createdAt))
    .slice(0, 8),
)
</script>

<template>
  <HgPanel title="Latest activity" :padded="false">
    <p v-if="rows.length === 0" class="hg-muted hg-activity-empty">
      Nothing has been deployed yet.
    </p>
    <ol v-else class="hg-activity">
      <li v-for="row in rows" :key="row.deployment.id">
        <RouterLink
          :to="{ name: 'deployment', params: { id: row.deployment.id } }"
          class="hg-activity-row"
        >
          <StatusBadge :status="row.deployment.status" size="sm" />
          <span class="hg-activity-main">
            <strong>{{ row.project }}</strong>
            <span class="hg-muted">
              #{{ row.deployment.number }},
              {{ triggerCopy[row.deployment.trigger].toLowerCase() }}</span
            >
          </span>
          <code class="hg-muted">{{ shortSha(row.deployment.commitSha) }}</code>
          <span class="hg-muted hg-activity-time">{{
            relativeTime(row.deployment.createdAt, now)
          }}</span>
        </RouterLink>
      </li>
    </ol>
  </HgPanel>
</template>

<style scoped>
.hg-activity {
  list-style: none;
  margin: 0;
  padding: var(--hg-space-2) 0;
}
.hg-activity-empty {
  padding: var(--hg-space-4) var(--hg-space-5);
}
.hg-activity-row {
  display: grid;
  grid-template-columns: 7.5rem 1fr auto auto;
  gap: var(--hg-space-3);
  align-items: center;
  padding: var(--hg-space-2) var(--hg-space-5);
  color: inherit;
  text-decoration: none;
  font-size: var(--hg-size-sm);
}
.hg-activity-row:hover {
  background: var(--hg-raised);
}
.hg-activity-main {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 36rem) {
  .hg-activity-row {
    grid-template-columns: 6.5rem 1fr auto;
  }
  .hg-activity-time {
    display: none;
  }
}
</style>
