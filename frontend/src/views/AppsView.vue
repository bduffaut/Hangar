<script setup lang="ts">
import { CATALOG } from '@hangar/shared'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useProjectsStore } from '../stores/projects.ts'
import { BaseIcon } from '../ui/index.ts'

// Ready-made apps to install in one click, and any published image for those who know one (D42).
useDocumentTitle('Apps')
const projects = useProjectsStore()
void projects.ensureLoaded().catch(() => {})
const installed = (id: string) => projects.projects.filter((p) => p.catalogId === id)
const CATEGORY = {
  media: 'Media',
  photos: 'Photos',
  files: 'Files',
  'smart-home': 'Smart home',
  monitoring: 'Monitoring',
  developer: 'Developer tools',
} as const
</script>

<template>
  <PageHeader
    title="Apps"
    subtitle="Ready-made software for this computer. Each one is private to your devices unless you choose to publish it."
  />
  <div class="hg-apps">
    <RouterLink
      v-for="app in CATALOG"
      :key="app.id"
      :to="{ name: 'app-install', params: { id: app.id } }"
      class="hg-app-card hg-notched"
    >
      <span class="hg-app-category">{{ CATEGORY[app.category] }}</span>
      <h2>{{ app.name }}</h2>
      <p class="hg-muted">{{ app.summary }}</p>
      <span v-if="installed(app.id).length" class="hg-app-installed">
        <BaseIcon name="check" :size="14" /> Installed as
        {{
          installed(app.id)
            .map((p) => p.name)
            .join(', ')
        }}
      </span>
      <span v-else class="hg-app-go">Install</span>
    </RouterLink>
    <RouterLink
      :to="{ name: 'app-install', params: { id: 'image' } }"
      class="hg-app-card is-custom"
    >
      <span class="hg-app-category">Advanced</span>
      <h2>Any image</h2>
      <p class="hg-muted">
        Run a published Docker image by name, like ghcr.io/owner/app:1.2, with its own storage.
      </p>
      <span class="hg-app-go">Run an image</span>
    </RouterLink>
  </div>
  <p class="hg-muted hg-apps-more">
    More apps are coming: photo backup, passwords, smart home, and game servers. See the
    <a
      href="https://github.com/bduffaut/Hangar/blob/main/docs/ROADMAP.md"
      target="_blank"
      rel="noopener"
      >roadmap</a
    >.
  </p>
</template>

<style scoped>
.hg-apps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--hg-space-4);
}
.hg-app-card {
  --hg-notch: 12px;
  display: grid;
  align-content: start;
  gap: var(--hg-space-2);
  min-height: 11rem;
  padding: var(--hg-space-5);
  border: 1px solid var(--hg-line);
  background: var(--hg-panel);
  color: var(--hg-ink);
  text-decoration: none;
}
.hg-app-card:hover {
  border-color: var(--hg-accent);
}
.hg-app-card:focus-visible {
  outline: 2px solid var(--hg-focus, var(--hg-link));
  outline-offset: 2px;
}
.hg-app-card.is-custom {
  border-style: dashed;
  background: transparent;
}
.hg-app-card h2 {
  font-size: var(--hg-size-lg);
}
.hg-app-card p {
  margin: 0;
  font-size: var(--hg-size-sm);
  line-height: 1.55;
}
.hg-app-category {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
.hg-app-go,
.hg-app-installed {
  margin-top: auto;
  padding-top: var(--hg-space-3);
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-bold);
  color: var(--hg-accent);
}
.hg-app-installed {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  color: var(--hg-status-ready);
}
.hg-apps-more {
  margin-top: var(--hg-space-6);
  font-size: var(--hg-size-sm);
}
</style>
