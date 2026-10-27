<script setup lang="ts">
import { emptyCopy, navCopy, type ProjectView } from '@hangar/shared'
import { computed } from 'vue'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { useNow } from '../../composables/useNow.ts'
import { formatBytes, relativeTime, shortSha } from '../../lib/format.ts'
import { useMetricsStore } from '../../stores/metrics.ts'
import { BaseButton, BaseIcon, BaseSkeleton } from '../../ui/index.ts'
import EmptyState from '../EmptyState.vue'
import RunwayLights from '../RunwayLights.vue'
import StatusBadge from '../StatusBadge.vue'

// Every project as a row of a departures board: where it lives, what was last deployed, how its
// recent deployments went, and where it stands now. On phones each row becomes a small block.
const props = defineProps<DashboardWidgetProps>()
const projects = computed(() => props.data.projects.value)
const loaded = computed(() => props.data.projectsLoaded.value)
const metrics = useMetricsStore()
const now = useNow()

const memoryOf = (project: ProjectView) =>
  metrics.latest?.containers.find((c) => c.projectId === project.id)?.memoryUsedBytes ?? null
const isLive = (project: ProjectView) =>
  !!project.url && !!project.current && project.desiredState === 'running'
const address = (url: string) => url.replace(/^https?:\/\//, '')
</script>

<template>
  <section class="hg-board" data-tour="projects" aria-labelledby="projects-heading">
    <h2 id="projects-heading" class="hg-visually-hidden">{{ navCopy.projects }}</h2>
    <div v-if="!loaded" class="hg-board-loading" aria-busy="true">
      <BaseSkeleton v-for="i in 3" :key="i" height="3rem" />
    </div>
    <EmptyState
      v-else-if="projects.length === 0"
      :title="emptyCopy.projects.title"
      :body="emptyCopy.projects.body"
    >
      <RouterLink v-slot="{ navigate }" :to="{ name: 'new-project' }" custom>
        <BaseButton
          variant="primary"
          icon="plus"
          :label="emptyCopy.projects.action"
          @click="navigate"
        />
      </RouterLink>
    </EmptyState>
    <table v-else class="hg-board-table">
      <thead>
        <tr>
          <th scope="col">App</th>
          <th scope="col">Address</th>
          <th scope="col">Last deployment</th>
          <th scope="col">Recent</th>
          <th scope="col">Memory</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="project in projects" :key="project.id" :data-project="project.name">
          <th scope="row" class="hg-cell-app">
            <RouterLink :to="{ name: 'project', params: { name: project.name } }">{{
              project.name
            }}</RouterLink>
          </th>
          <td class="hg-cell-address">
            <a v-if="isLive(project)" :href="project.url!" target="_blank" rel="noopener"
              >{{ address(project.url!) }}<BaseIcon name="external" :size="12"
            /></a>
            <span v-else class="hg-muted">{{
              project.desiredState === 'stopped' ? 'Stopped' : 'Not live yet'
            }}</span>
          </td>
          <td class="hg-cell-commit">
            <template v-if="project.latest">
              <span class="hg-commit-message">{{
                project.latest.commitMessage ?? 'Waiting for commit details'
              }}</span>
              <span class="hg-commit-meta hg-muted"
                ><code>{{ shortSha(project.latest.commitSha) }}</code>
                {{ relativeTime(project.latest.createdAt, now) }}</span
              >
            </template>
            <span v-else class="hg-muted">No deployments yet</span>
          </td>
          <td class="hg-cell-lights">
            <RunwayLights :recent="project.recent" :slots="8" />
          </td>
          <td class="hg-cell-memory">
            <template v-if="isLive(project) && memoryOf(project) !== null">
              <span class="hg-data">{{ formatBytes(memoryOf(project)!) }}</span>
              <span class="hg-muted"> of {{ project.memoryLimitMb }} MB</span>
            </template>
            <span v-else class="hg-muted" aria-label="Not running">–</span>
          </td>
          <td class="hg-cell-status">
            <StatusBadge v-if="project.latest" :status="project.latest.status" />
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.hg-board {
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-lg);
  min-width: 0;
}
.hg-board-loading {
  display: grid;
  gap: var(--hg-space-2);
  padding: var(--hg-space-4);
}
.hg-board-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.hg-board-table th,
.hg-board-table td {
  padding: var(--hg-space-3) var(--hg-space-4);
  text-align: left;
  vertical-align: middle;
  border-top: 1px solid var(--hg-line);
  min-width: 0;
}
.hg-board-table thead th {
  border-top: 0;
  padding-block: var(--hg-space-3) var(--hg-space-2);
  font-size: var(--hg-size-xs);
  font-weight: var(--hg-weight-medium);
  color: var(--hg-ink-muted);
}
.hg-board-table thead th:nth-child(1) {
  width: 15%;
}
.hg-board-table thead th:nth-child(2) {
  width: 23%;
}
.hg-board-table thead th:nth-child(4) {
  width: 9.5rem;
}
.hg-board-table thead th:nth-child(5) {
  width: 9rem;
}
.hg-board-table thead th:nth-child(6) {
  width: 8.5rem;
}
.hg-board-table tbody tr:hover {
  background: color-mix(in srgb, var(--hg-raised) 60%, transparent);
}
.hg-cell-app a {
  color: var(--hg-ink);
  font-size: var(--hg-size-md);
  font-stretch: 112%;
  font-weight: var(--hg-weight-bold);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.hg-cell-app a:hover {
  text-decoration: underline;
}
.hg-cell-address a,
.hg-cell-address span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  max-width: 100%;
  font-family: var(--hg-data);
  font-size: var(--hg-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-cell-address span {
  font-family: inherit;
}
.hg-cell-commit {
  font-size: var(--hg-size-sm);
}
.hg-commit-message,
.hg-commit-meta {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-commit-meta {
  font-size: var(--hg-size-xs);
}
.hg-commit-meta code {
  margin-right: var(--hg-space-1);
}
.hg-cell-memory {
  font-size: var(--hg-size-sm);
  white-space: nowrap;
}
.hg-cell-status {
  text-align: right;
}
@media (max-width: 60rem) {
  .hg-board-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .hg-board-table,
  .hg-board-table tbody {
    display: block;
  }
  .hg-board-table tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'app status'
      'address address'
      'commit commit'
      'lights memory';
    gap: var(--hg-space-2) var(--hg-space-3);
    padding: var(--hg-space-4);
    border-top: 1px solid var(--hg-line);
  }
  .hg-board-table tbody tr:first-child {
    border-top: 0;
  }
  .hg-board-table tbody th,
  .hg-board-table tbody td {
    display: block;
    padding: 0;
    border: 0;
  }
  .hg-cell-app {
    grid-area: app;
  }
  .hg-cell-status {
    grid-area: status;
  }
  .hg-cell-address {
    grid-area: address;
  }
  .hg-cell-commit {
    grid-area: commit;
  }
  .hg-cell-lights {
    grid-area: lights;
    max-width: 12rem;
  }
  .hg-cell-memory {
    grid-area: memory;
    align-self: center;
  }
}
</style>
