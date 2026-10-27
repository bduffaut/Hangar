<script setup lang="ts" generic="T extends string | number">
import Select from 'primevue/select'

export interface SelectOption<V> {
  label: string
  value: V
  hint?: string
}

const model = defineModel<T | null>()
defineProps<{ id: string; options: SelectOption<T>[]; placeholder?: string; filter?: boolean; loading?: boolean }>()
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
.hg-option {
  display: grid;
}
.hg-option-hint {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
</style>
