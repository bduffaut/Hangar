<script setup lang="ts">
import { navCopy } from '@hangar/shared'
import { onMounted } from 'vue'
import DashboardGrid from '../components/DashboardGrid.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useTour } from '../composables/useTour.ts'
import { useProjectsStore } from '../stores/projects.ts'
import { BaseButton } from '../ui/index.ts'

useDocumentTitle(navCopy.projects)
const projects = useProjectsStore()
const tour = useTour()

onMounted(async () => {
  await projects.load().catch(() => {})
  tour.startIfNew()
})
</script>

<template>
  <PageHeader :title="navCopy.projects" :subtitle="`${projects.projects.length} ${projects.projects.length === 1 ? 'app' : 'apps'} in the hangar`">
    <template #actions>
      <RouterLink :to="{ name: 'new-project' }" custom #default="{ navigate }">
        <BaseButton variant="primary" icon="plus" :label="navCopy.newProject" data-tour="new-project" @click="navigate" />
      </RouterLink>
    </template>
  </PageHeader>
  <DashboardGrid />
</template>
