<script setup lang="ts" generic="T extends string | number">
import Select from 'primevue/select'

export interface SelectOption<V> {
  label: string
  value: V
  hint?: string
}

const model = defineModel<T | null>()
defineProps<{
  id: string
  options: SelectOption<T>[]
  placeholder?: string
  filter?: boolean
  loading?: boolean
  /** Monospace, for values typed exactly, like domains. */
  mono?: boolean
}>()
</script>

<template>
  <Select
    v-model="model"
    :input-id="id"
    :options="options"
    option-label="label"
    option-value="value"
    :placeholder="placeholder"
    :filter="filter"
    :loading="loading"
    fluid
    class="hg-select"
    :class="{ 'is-mono': mono }"
  >
    <template #option="{ option }">
      <div class="hg-option">
        <span>{{ option.label }}</span>
        <span v-if="option.hint" class="hg-option-hint">{{ option.hint }}</span>
      </div>
    </template>
  </Select>
</template>

<style scoped>
/* The same text size as text inputs, so a select and an input side by side line up. */
.hg-select :deep(.p-select-label) {
  font-size: var(--hg-size-base);
}
.hg-select.is-mono :deep(.p-select-label) {
  font-family: var(--hg-mono);
  font-size: var(--hg-size-sm);
}
.hg-option {
  display: grid;
}
.hg-option-hint {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
</style>
