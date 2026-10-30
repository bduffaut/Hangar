<script setup lang="ts" generic="T extends string">
import SelectButton from 'primevue/selectbutton'

// A small set of mutually exclusive choices shown side by side.
const model = defineModel<T>({ required: true })
defineProps<{ options: { label: string; value: T }[]; label: string }>()
</script>

<template>
  <SelectButton
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    :allow-empty="false"
    :aria-label="label"
    size="small"
  />
</template>

<style scoped>
/* A recessed track with the chosen option raised out of it. */
.p-selectbutton {
  padding: 2px;
  gap: 2px;
  background: var(--hg-canvas);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-md);
}
.p-selectbutton :deep(.p-togglebutton) {
  background: transparent;
  border: 0;
  border-radius: var(--hg-radius-sm);
  color: var(--hg-ink-muted);
  font-weight: var(--hg-weight-regular);
  transition:
    background-color var(--hg-motion-fast) var(--hg-motion-easing),
    color var(--hg-motion-fast) var(--hg-motion-easing);
}
.p-selectbutton :deep(.p-togglebutton:hover) {
  color: var(--hg-ink);
}
.p-selectbutton :deep(.p-togglebutton-checked) {
  color: var(--hg-ink);
}
.p-selectbutton :deep(.p-togglebutton-content) {
  background: transparent;
  box-shadow: none;
}
.p-selectbutton :deep(.p-togglebutton-checked .p-togglebutton-content) {
  background: var(--hg-raised);
  box-shadow: inset 0 -2px 0 var(--hg-accent);
}
</style>
