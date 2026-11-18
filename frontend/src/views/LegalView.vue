<script setup lang="ts">
import { legalCopy } from '@hangar/shared'
import BrandMark from '../brand/BrandMark.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'

// The site's privacy page: public, plain, and the same for every visitor.
const doc = legalCopy.privacy
useDocumentTitle(doc.title)
</script>

<template>
  <div class="hg-legal">
    <header class="hg-legal-bar">
      <RouterLink :to="{ name: 'welcome' }" aria-label="Hangar home"><BrandMark /></RouterLink>
    </header>
    <main class="hg-legal-main">
      <h1>{{ doc.title }}</h1>
      <p class="hg-muted">{{ legalCopy.updated }}</p>
      <section v-for="section in doc.sections" :key="section.heading">
        <h2>{{ section.heading }}</h2>
        <p>{{ section.body }}</p>
      </section>
      <RouterLink :to="{ name: 'welcome' }">{{ legalCopy.back }}</RouterLink>
    </main>
  </div>
</template>

<style scoped>
.hg-legal {
  min-height: 100dvh;
}
.hg-legal-bar,
.hg-legal-main {
  max-width: 44rem;
  margin: 0 auto;
  padding: 0 var(--hg-space-5);
}
.hg-legal-bar {
  display: flex;
  align-items: center;
  height: 4rem;
}
.hg-legal-main {
  display: grid;
  gap: var(--hg-space-4);
  padding-top: var(--hg-space-6);
  padding-bottom: var(--hg-space-6);
  line-height: 1.65;
}
.hg-legal-main h1 {
  font-size: var(--hg-size-xxl);
  letter-spacing: -0.03em;
}
.hg-legal-main h2 {
  font-size: var(--hg-size-md);
  margin-bottom: var(--hg-space-2);
}
.hg-legal-main p {
  margin: 0;
}
@media (max-width: 36rem) {
  .hg-legal-bar,
  .hg-legal-main {
    padding: 0 var(--hg-space-4);
  }
}
</style>
