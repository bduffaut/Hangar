<script setup lang="ts">
import { notFoundCopy } from '@hangar/shared'
import EmptyState from '../components/EmptyState.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { BaseButton } from '../ui/index.ts'

useDocumentTitle('Not found')
</script>

<template>
  <main class="hg-not-found">
    <EmptyState :title="notFoundCopy.title" :body="notFoundCopy.body">
      <RouterLink :to="{ name: 'home' }" custom #default="{ navigate }">
        <BaseButton variant="primary" :label="notFoundCopy.action" @click="navigate" />
      </RouterLink>
    </EmptyState>
  </main>
</template>

<style scoped>
.hg-not-found {
  padding: var(--hg-space-7) var(--hg-space-5);
  max-width: var(--hg-width-narrow);
  margin: 0 auto;
}
</style>
