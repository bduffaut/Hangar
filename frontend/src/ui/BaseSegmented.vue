<script setup lang="ts" generic="T extends string">
import SelectButton from 'primevue/selectbutton'

// A small set of mutually exclusive choices shown side by side.
const model = defineModel<T>({ required: true })
defineProps<{ options: { label: string; value: T }[]; ariaLabel: string }>()
</script>

<template>
  <SelectButton
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    :allow-empty="false"
    :aria-label="ariaLabel"
    size="small"
  />
</template>
