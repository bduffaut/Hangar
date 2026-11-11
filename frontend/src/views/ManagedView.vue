<script setup lang="ts">
import { managedCopy } from '@hangar/shared'
import BrandMark from '../brand/BrandMark.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useSessionStore } from '../stores/session.ts'

// Shown on someone's own server, at its local address: its dashboard is on the central Hangar.
useDocumentTitle('Hangar')
const session = useSessionStore()
</script>

<template>
  <main class="hg-managed">
    <div class="hg-managed-card hg-notched">
      <BrandMark :size="34" />
      <h1>{{ managedCopy.title }}</h1>
      <p class="hg-muted">{{ managedCopy.body(session.managedBy ?? '') }}</p>
      <a v-if="session.managedBy" class="hg-managed-link" :href="session.managedBy">{{
        managedCopy.open
      }}</a>
    </div>
  </main>
</template>

<style scoped>
.hg-managed {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--hg-space-4);
}
.hg-managed-card {
  width: min(30rem, 100%);
  display: grid;
  gap: var(--hg-space-4);
  padding: var(--hg-space-6);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
}
.hg-managed-link {
  justify-self: start;
  padding: var(--hg-space-2) var(--hg-space-4);
  background: var(--hg-accent-fill);
  color: var(--hg-on-accent);
  text-decoration: none;
}
.hg-managed-card h1 {
  font-size: var(--hg-size-xl);
}
</style>
