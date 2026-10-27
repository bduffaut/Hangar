<script setup lang="ts">
import { computed } from 'vue'
import { emptyCopy, navCopy } from '@hangar/shared'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { BaseButton, BaseSkeleton } from '../../ui/index.ts'
import EmptyState from '../EmptyState.vue'
import ProjectCard from '../ProjectCard.vue'

const props = defineProps<DashboardWidgetProps>()
const projects = computed(() => props.data.projects.value)
const loaded = computed(() => props.data.projectsLoaded.value)
</script>

<template>
  <section class="hg-projects" data-tour="projects" aria-labelledby="projects-heading">
    <h2 id="projects-heading" class="hg-visually-hidden">{{ navCopy.projects }}</h2>
    <div v-if="!loaded" class="hg-project-grid" aria-busy="true">
      <BaseSkeleton v-for="i in 3" :key="i" height="11rem" />
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
    <div v-else class="hg-project-grid">
      <ProjectCard v-for="project in projects" :key="project.id" :project="project" />
    </div>
  </section>
</template>

<style scoped>
.hg-project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
  gap: var(--hg-space-4);
}
</style>
