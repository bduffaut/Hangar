<script setup lang="ts">
// A label, the control (slot), help text, and an error, wired together for screen readers.
defineProps<{ label: string; for: string; help?: string; error?: string | null }>()
</script>

<template>
  <div class="hg-field">
    <label class="hg-field-label" :for="$props.for">{{ label }}</label>
    <slot />
    <p v-if="error" :id="`${$props.for}-error`" class="hg-field-error" role="alert">{{ error }}</p>
    <p v-else-if="help" :id="`${$props.for}-help`" class="hg-field-help">{{ help }}</p>
  </div>
</template>

<style scoped>
.hg-field {
  display: grid;
  gap: var(--hg-space-2);
  /* In a form grid, a field next to a taller one keeps its own height. */
  align-content: start;
}
.hg-field-label {
  font-weight: var(--hg-weight-regular);
  font-size: var(--hg-size-sm);
}
.hg-field-help,
.hg-field-error {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-field-error {
  color: var(--hg-danger);
}
</style>
