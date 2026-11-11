<script setup lang="ts">
import { dashboardCopy, navCopy } from '@hangar/shared'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import DashboardBoard from '../components/dashboard/DashboardBoard.vue'
import FlightDeck from '../components/FlightDeck.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useTour } from '../composables/useTour.ts'
import { useDashboardLayout } from '../dashboard/index.ts'
import { useProjectsStore } from '../stores/projects.ts'
import { BaseButton, BaseSkeleton, useConfirmAction, useNotify } from '../ui/index.ts'

useDocumentTitle(navCopy.overview)
const projects = useProjectsStore()
const tour = useTour()
const notify = useNotify()
const confirm = useConfirmAction()
const layout = useDashboardLayout()
const board = useTemplateRef<InstanceType<typeof DashboardBoard>>('board')
const editing = ref(false)

const live = computed(
  () => projects.projects.filter((p) => p.current && p.desiredState === 'running').length,
)
const summary = computed(() => {
  const total = projects.projects.length
  if (total === 0) return navCopy.projectCount(0)
  return `${navCopy.projectCount(total)}, ${live.value} live`
})

onMounted(async () => {
  await Promise.all([layout.load(), projects.ensureLoaded().catch(() => {})])
  tour.startIfNew()
})

async function finish() {
  editing.value = false
  await layout.saveNow().catch(() => notify.error('The layout was not saved', 'Try again.'))
}
async function reset() {
  if (await confirm({ ...dashboardCopy.resetConfirm })) layout.reset()
}
// Leaving mid-customization keeps the changes, like pressing Done.
onBeforeRouteLeave(() => {
  if (editing.value) void finish()
})
onBeforeUnmount(() => {
  if (editing.value) void layout.saveNow().catch(() => {})
})
</script>

<template>
  <FlightDeck />
  <header class="hg-home-head">
    <p class="hg-muted hg-home-summary">{{ summary }}</p>
    <div v-if="!editing" class="hg-home-actions">
      <BaseButton
        variant="ghost"
        icon="layout"
        :label="dashboardCopy.customize"
        data-tour="customize"
        :disabled="!layout.loaded.value"
        @click="editing = true"
      />
      <RouterLink v-slot="{ navigate }" :to="{ name: 'new-project' }" custom>
        <BaseButton icon="plus" :label="navCopy.newProject" @click="navigate" />
      </RouterLink>
      <RouterLink v-slot="{ navigate }" :to="{ name: 'publish' }" custom>
        <BaseButton
          variant="primary"
          icon="upload"
          :label="navCopy.publish"
          data-tour="new-project"
          @click="navigate"
        />
      </RouterLink>
    </div>
    <div v-else class="hg-home-actions" role="toolbar" aria-label="Customize the home screen">
      <BaseButton
        v-hint.bottom="dashboardCopy.undo"
        variant="ghost"
        size="sm"
        icon="undo"
        :aria-label="dashboardCopy.undo"
        :disabled="!board?.canUndo"
        @click="board?.undo()"
      />
      <BaseButton
        v-hint.bottom="dashboardCopy.redo"
        variant="ghost"
        size="sm"
        icon="redo"
        :aria-label="dashboardCopy.redo"
        :disabled="!board?.canRedo"
        @click="board?.redo()"
      />
      <BaseButton variant="ghost" :label="dashboardCopy.reset" @click="reset" />
      <BaseButton variant="primary" icon="check" :label="dashboardCopy.done" @click="finish" />
    </div>
  </header>

  <div v-if="!layout.loaded.value" class="hg-home-loading" aria-busy="true">
    <BaseSkeleton height="4rem" />
    <BaseSkeleton height="12rem" />
  </div>
  <DashboardBoard
    v-else
    ref="board"
    v-model="layout.widgets.value"
    :editing="editing"
    @changed="layout.save()"
  />
</template>

<style scoped>
.hg-home-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--hg-space-4);
  margin-bottom: var(--hg-space-5);
}
.hg-home-summary {
  font-size: var(--hg-size-sm);
}
.hg-home-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-2);
}
.hg-home-loading {
  display: grid;
  gap: var(--hg-space-4);
}
</style>
