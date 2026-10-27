<script setup lang="ts">
// A flat section of the page with an optional title row. Hierarchy comes from tone and spacing,
// not shadows.
withDefaults(defineProps<{ title?: string; description?: string; padded?: boolean }>(), {
  padded: true,
})
</script>

<template>
  <section class="hg-panel" :class="{ 'is-flush': padded === false }">
    <header v-if="title || $slots.actions" class="hg-panel-header">
      <div class="hg-panel-heading">
        <h2 v-if="title" class="hg-panel-title">{{ title }}</h2>
        <p v-if="description" class="hg-muted hg-panel-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="hg-panel-actions"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.hg-panel {
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-lg);
  padding: var(--hg-space-5);
  min-width: 0;
}
.is-flush {
  padding: 0;
}
.is-flush .hg-panel-header {
  padding: var(--hg-space-4) var(--hg-space-5);
  margin: 0;
  border-bottom: 1px solid var(--hg-line);
}
.hg-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--hg-space-3);
  margin-bottom: var(--hg-space-4);
}
.hg-panel-heading {
  display: grid;
  gap: var(--hg-space-1);
}
.hg-panel-title {
  font-size: var(--hg-size-md);
}
.hg-panel-description {
  font-size: var(--hg-size-sm);
}
.hg-panel-actions {
  display: flex;
  gap: var(--hg-space-2);
}
</style>
