<script setup lang="ts">
defineProps<{ title: string; body?: string }>()
</script>

<template>
  <div class="hg-empty">
    <slot name="art" />
    <h3>{{ title }}</h3>
    <p v-if="body" class="hg-muted">{{ body }}</p>
    <div v-if="$slots.default" class="hg-empty-actions"><slot /></div>
  </div>
</template>

<style scoped>
.hg-empty {
  display: grid;
  justify-items: start;
  gap: var(--hg-space-3);
  padding: var(--hg-space-6) 0;
}
.hg-empty h3 {
  font-size: var(--hg-size-lg);
}
.hg-empty-actions {
  margin-top: var(--hg-space-2);
}
</style>
