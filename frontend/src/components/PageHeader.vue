<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <header class="hg-page-header">
    <div class="hg-page-heading">
      <slot name="before" />
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="hg-muted">{{ subtitle }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="hg-page-actions"><slot name="actions" /></div>
  </header>
</template>

<style scoped>
.hg-page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--hg-space-4);
  margin-bottom: var(--hg-space-6);
}
.hg-page-heading {
  display: grid;
  gap: var(--hg-space-2);
  min-width: 0;
}
.hg-page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2);
}
</style>
