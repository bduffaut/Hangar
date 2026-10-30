<script setup lang="ts">
import { emptyCopy, type ProjectView } from '@hangar/shared'
import { computed } from 'vue'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { useNow } from '../../composables/useNow.ts'
import { formatBytes, relativeTime, shortSha } from '../../lib/format.ts'
import { useMetricsStore } from '../../stores/metrics.ts'
import { BaseButton, BaseIcon, BaseSkeleton } from '../../ui/index.ts'
import EmptyState from '../EmptyState.vue'
import RunwayLights from '../RunwayLights.vue'
import StatusBadge from '../StatusBadge.vue'

// Every project as a flight strip, the paper strips air traffic controllers keep one per
// aircraft: the edge shows its status, then its name, address, last commit, recent deployments,
// and memory. The whole strip opens the project.
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
const edge = (project: ProjectView) =>
  project.desiredState === 'stopped' ? 'stopped' : (project.latest?.status ?? 'none')
</script>

<template>
  <div class="hg-strips" data-tour="projects">
    <div v-if="!loaded" class="hg-strips-loading" aria-busy="true">
      <BaseSkeleton v-for="i in 3" :key="i" height="3.25rem" />
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
    <ul v-else class="hg-strip-rack">
      <li
        v-for="project in projects"
        :key="project.id"
        class="hg-strip"
        :class="`is-${edge(project)}`"
        :data-project="project.name"
      >
        <RouterLink
          :to="{ name: 'project', params: { name: project.name } }"
          class="hg-strip-name"
          >{{ project.name }}</RouterLink
        >
        <span class="hg-strip-address">
          <a v-if="isLive(project)" :href="project.url!" target="_blank" rel="noopener"
            >{{ address(project.url!) }}<BaseIcon name="external" :size="12"
          /></a>
          <span v-else class="hg-muted">{{
            project.desiredState === 'stopped' ? 'Stopped' : 'Not live yet'
          }}</span>
        </span>
        <span class="hg-strip-commit">
          <template v-if="project.latest">
            <span class="hg-strip-message">{{
              project.latest.commitMessage ?? 'Waiting for commit details'
            }}</span>
            <span class="hg-strip-meta"
              ><code>{{ shortSha(project.latest.commitSha) }}</code>
              {{ relativeTime(project.latest.createdAt, now) }}</span
            >
          </template>
          <span v-else class="hg-muted">No deployments yet</span>
        </span>
        <span class="hg-strip-lights"><RunwayLights :recent="project.recent" :slots="8" /></span>
        <span class="hg-strip-memory">
          <template v-if="isLive(project) && memoryOf(project) !== null">
            <span class="hg-data">{{ formatBytes(memoryOf(project)!) }}</span>
            <span class="hg-muted"> / {{ project.memoryLimitMb }} MB</span>
          </template>
          <span v-else class="hg-muted" aria-label="Not running">–</span>
        </span>
        <span class="hg-strip-status">
          <StatusBadge v-if="project.latest" :status="project.latest.status" />
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hg-strips {
  container-type: inline-size;
  padding: var(--hg-space-1) var(--hg-space-3) var(--hg-space-3);
}
.hg-strips-loading {
  display: grid;
  gap: var(--hg-space-2);
}
.hg-strip-rack {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-2);
}
.hg-strip {
  --edge: var(--hg-line);
  position: relative;
  display: grid;
  grid-template-columns:
    minmax(7rem, 1.1fr) minmax(9rem, 1.5fr) minmax(10rem, 2fr)
    7.5rem 8rem 7.5rem;
  align-items: center;
  gap: 0;
  min-height: 3.25rem;
  background: color-mix(in srgb, var(--hg-raised) 55%, var(--hg-panel));
  border: 1px solid var(--hg-line);
  border-left: 4px solid var(--edge);
  border-radius: var(--hg-radius-md);
  transition:
    transform var(--hg-motion-base) var(--hg-motion-easing),
    border-color var(--hg-motion-fast) var(--hg-motion-easing),
    background-color var(--hg-motion-fast) var(--hg-motion-easing);
}
/* Hovering slides the strip along its rack, as a controller pushes the one they are working. */
.hg-strip:hover {
  transform: translateX(4px);
  background: var(--hg-raised);
  border-top-color: color-mix(in srgb, var(--hg-ink-muted) 50%, var(--hg-line));
  border-right-color: color-mix(in srgb, var(--hg-ink-muted) 50%, var(--hg-line));
  border-bottom-color: color-mix(in srgb, var(--hg-ink-muted) 50%, var(--hg-line));
}
.is-queued {
  --edge: var(--hg-status-queued);
}
.is-building {
  --edge: var(--hg-status-building);
}
.is-deploying {
  --edge: var(--hg-status-deploying);
}
.is-ready {
  --edge: var(--hg-status-ready);
}
.is-failed {
  --edge: var(--hg-status-failed);
}
.is-cancelled,
.is-stopped {
  --edge: var(--hg-status-cancelled);
}
/* Fields are divided like the boxes printed on a strip. */
.hg-strip > * {
  min-width: 0;
  padding: var(--hg-space-2) var(--hg-space-3);
  border-left: 1px solid var(--hg-line);
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.hg-strip > :first-child {
  border-left: 0;
}
.hg-strip-name {
  color: var(--hg-ink);
  font-weight: var(--hg-weight-bold);
  font-size: var(--hg-size-md);
  text-decoration: none;
  overflow-wrap: anywhere;
}
/* The name's link covers the strip; links inside it sit above. */
.hg-strip-name::after {
  content: '';
  position: absolute;
  inset: 0;
}
.hg-strip-name:focus-visible {
  outline: none;
}
.hg-strip:has(.hg-strip-name:focus-visible) {
  outline: 2px solid var(--hg-accent);
  outline-offset: 2px;
}
.hg-strip-address a,
.hg-strip-status :deep([tabindex]) {
  position: relative;
  z-index: 1;
}
.hg-strip-address a,
.hg-strip-address span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  max-width: 100%;
  font-size: var(--hg-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-strip-commit {
  font-size: var(--hg-size-sm);
}
.hg-strip-message,
.hg-strip-meta {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-strip-meta {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
.hg-strip-meta code {
  margin-right: var(--hg-space-1);
}
.hg-strip-memory {
  font-size: var(--hg-size-sm);
  white-space: nowrap;
}
.hg-strip-status {
  align-items: flex-end;
}
/* The widget can be resized, so strips follow its width rather than the window's. */
@container (max-width: 56rem) {
  .hg-strip {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'name status'
      'address address'
      'commit commit'
      'lights memory';
    padding: var(--hg-space-2) 0;
  }
  .hg-strip > * {
    border-left: 0;
    padding-block: var(--hg-space-1);
  }
  .hg-strip-name {
    grid-area: name;
  }
  .hg-strip-status {
    grid-area: status;
  }
  .hg-strip-address {
    grid-area: address;
  }
  .hg-strip-commit {
    grid-area: commit;
  }
  .hg-strip-lights {
    grid-area: lights;
    max-width: 12rem;
  }
  .hg-strip-memory {
    grid-area: memory;
  }
}
</style>
