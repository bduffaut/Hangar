<script setup lang="ts">
import { DEPLOYMENT_STATUSES, guideCopy, statusCopy } from '@hangar/shared'
import { useRouter } from 'vue-router'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useTour } from '../composables/useTour.ts'
import { BaseButton } from '../ui/index.ts'

useDocumentTitle(guideCopy.title)
const tour = useTour()
const router = useRouter()

async function restartTour() {
  await router.push({ name: 'home' })
  tour.start()
}

const pipeline = [
  { title: 'Download', body: 'Fetch exactly the commit being deployed.' },
  {
    title: 'Build',
    body: 'Turn the code into an image, using your Dockerfile or by detecting the framework.',
  },
  { title: 'Start', body: 'Run the new version next to the old one. Nobody sees it yet.' },
  { title: 'Check', body: 'Wait up to a minute for the app to answer on its port.' },
  { title: 'Switch', body: 'Point the address at the new version, then stop the old one.' },
]
</script>

<template>
  <PageHeader :title="guideCopy.title" :subtitle="guideCopy.intro">
    <template #actions>
      <BaseButton icon="book" label="Show the tour again" @click="restartTour" />
    </template>
  </PageHeader>

  <div class="hg-guide">
    <HgPanel title="What happens when you deploy" class="hg-guide-wide">
      <ol class="hg-pipeline">
        <li v-for="(stage, i) in pipeline" :key="stage.title">
          <span class="hg-pipeline-index" aria-hidden="true">{{ i + 1 }}</span>
          <strong>{{ stage.title }}</strong>
          <span class="hg-muted">{{ stage.body }}</span>
        </li>
      </ol>
      <p class="hg-muted hg-pipeline-note">
        If any step fails, the previous version keeps serving and nothing changes for visitors.
      </p>
    </HgPanel>

    <HgPanel title="Statuses">
      <dl class="hg-statuses">
        <div v-for="status in DEPLOYMENT_STATUSES" :key="status">
          <dt><StatusBadge :status="status" /></dt>
          <dd class="hg-muted">{{ statusCopy[status].meaning }}</dd>
        </div>
      </dl>
    </HgPanel>

    <HgPanel title="Good to know">
      <dl class="hg-topics">
        <div v-for="section in guideCopy.sections" :key="section.title">
          <dt>{{ section.title }}</dt>
          <dd class="hg-muted">{{ section.body }}</dd>
        </div>
      </dl>
    </HgPanel>
  </div>
</template>

<style scoped>
.hg-guide {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--hg-space-5);
  align-items: start;
}
.hg-guide-wide {
  grid-column: 1 / -1;
}
.hg-pipeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--hg-space-4);
  counter-reset: none;
}
.hg-pipeline li {
  display: grid;
  gap: var(--hg-space-1);
  align-content: start;
  padding-top: var(--hg-space-3);
  border-top: 2px solid var(--hg-line);
  font-size: var(--hg-size-sm);
}
.hg-pipeline li:last-child {
  border-top-color: var(--hg-status-ready);
}
.hg-pipeline-index {
  font-weight: var(--hg-weight-bold);
  color: var(--hg-accent);
}
.hg-pipeline-note {
  margin-top: var(--hg-space-4);
  font-size: var(--hg-size-sm);
}
.hg-statuses,
.hg-topics {
  margin: 0;
  display: grid;
  gap: var(--hg-space-4);
}
.hg-statuses div {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: var(--hg-space-3);
  align-items: center;
}
.hg-statuses dd,
.hg-topics dd {
  margin: 0;
  font-size: var(--hg-size-sm);
}
.hg-topics dt {
  font-weight: var(--hg-weight-medium);
}
@media (max-width: 52rem) {
  .hg-guide {
    grid-template-columns: 1fr;
  }
  .hg-pipeline {
    grid-template-columns: 1fr;
  }
}
</style>
