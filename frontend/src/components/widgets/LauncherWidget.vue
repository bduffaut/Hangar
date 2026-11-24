<script setup lang="ts">
import { catalogApp, dashboardCopy, type ProjectView } from '@hangar/shared'
import { computed, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { IS_SITE } from '../../demo/mode.ts'

// A tile per app and project, like a folder of bookmarks: its icon, its name, and a dot for its
// status. A live one opens its address in a new tab; anything else opens its page in Hangar.
// Apps from the catalog come first, then images, then projects, each by name.
const props = defineProps<DashboardWidgetProps>()
const copy = dashboardCopy.launcher

type Light = 'live' | 'busy' | 'failed' | 'stopped' | 'none'

const order = (p: ProjectView) => (p.catalogId ? 0 : p.kind === 'image' ? 1 : 2)
const tiles = computed(() =>
  [...props.data.projects.value]
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    .map((project) => {
      const live = !!project.current && project.desiredState === 'running' && !!project.url
      // Your own devices reach the private address; a public one is the fallback.
      const href = live ? (project.url ?? project.publicUrls[0] ?? null) : null
      return {
        project,
        href,
        label: catalogApp(project.catalogId ?? '')?.name ?? project.name,
        light: light(project, live),
      }
    }),
)

function light(project: ProjectView, live: boolean): Light {
  if (project.desiredState === 'stopped') return 'stopped'
  const status = project.latest?.status
  if (status === 'queued' || status === 'building' || status === 'deploying') return 'busy'
  if (live) return 'live'
  if (status === 'failed') return 'failed'
  return 'none'
}

// The icon is the app's own, which Hangar fetches from the running app (D45). Apps without one
// (or not running) get their first letter. The public site's tour has no real apps to ask.
const broken = reactive(new Set<string>())
const iconOf = (href: string | null, id: string) =>
  href && !IS_SITE && !broken.has(id) ? `/api/projects/${id}/icon` : null
</script>

<template>
  <div class="hg-launcher-wrap">
    <p
      v-if="props.data.projectsLoaded.value && tiles.length === 0"
      class="hg-muted hg-launcher-empty"
    >
      {{ copy.empty }}
      <RouterLink :to="{ name: 'apps' }">{{ copy.browse }}</RouterLink>
    </p>
    <ul v-else class="hg-launcher">
      <li v-for="tile in tiles" :key="tile.project.id">
        <component
          :is="tile.href ? 'a' : RouterLink"
          v-bind="
            tile.href
              ? { href: tile.href, target: '_blank', rel: 'noopener' }
              : { to: { name: 'project', params: { name: tile.project.name } } }
          "
          v-hint.top="copy.lights[tile.light]"
          class="hg-launcher-tile"
          :class="`is-${tile.light}`"
          :data-app="tile.project.name"
        >
          <span class="hg-launcher-icon" aria-hidden="true">
            <img
              v-if="iconOf(tile.href, tile.project.id)"
              :src="iconOf(tile.href, tile.project.id)!"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="broken.add(tile.project.id)"
            />
            <span v-else>{{ tile.label.charAt(0).toUpperCase() }}</span>
          </span>
          <span class="hg-launcher-name">{{ tile.label }}</span>
          <span class="hg-launcher-dot" role="img" :aria-label="copy.lights[tile.light]" />
        </component>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hg-launcher-wrap {
  padding: var(--hg-space-1) var(--hg-space-3) var(--hg-space-3);
}
.hg-launcher-empty {
  margin: 0;
  padding: var(--hg-space-2) 0;
  font-size: var(--hg-size-sm);
}
.hg-launcher {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: var(--hg-space-2);
}
.hg-launcher-tile {
  --light: var(--hg-status-cancelled);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--hg-space-2);
  padding: var(--hg-space-3) var(--hg-space-2) var(--hg-space-2);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-md);
  background: color-mix(in srgb, var(--hg-raised) 55%, var(--hg-panel));
  color: var(--hg-ink);
  text-decoration: none;
  transition:
    transform var(--hg-motion-base) var(--hg-motion-easing),
    background-color var(--hg-motion-fast) var(--hg-motion-easing);
}
.hg-launcher-tile:hover {
  transform: translateY(-2px);
  background: var(--hg-raised);
}
.hg-launcher-tile:focus-visible {
  outline: 2px solid var(--hg-accent);
  outline-offset: 2px;
}
.hg-launcher-icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--hg-radius-md);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  font-weight: var(--hg-weight-bold);
  font-size: var(--hg-size-md);
  color: var(--hg-ink-muted);
  overflow: hidden;
}
.hg-launcher-icon img {
  width: 1.75rem;
  height: 1.75rem;
  object-fit: contain;
}
.hg-launcher-name {
  max-width: 100%;
  font-size: var(--hg-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-launcher-dot {
  position: absolute;
  top: var(--hg-space-2);
  right: var(--hg-space-2);
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--light);
}
.is-live {
  --light: var(--hg-status-ready);
}
.is-busy {
  --light: var(--hg-status-building);
}
.is-failed {
  --light: var(--hg-status-failed);
}
.is-none .hg-launcher-name,
.is-stopped .hg-launcher-name {
  color: var(--hg-ink-muted);
}
@media (prefers-reduced-motion: reduce) {
  .hg-launcher-tile:hover {
    transform: none;
  }
}
</style>
