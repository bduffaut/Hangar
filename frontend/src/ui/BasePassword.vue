<script setup lang="ts">
import Password from 'primevue/password'

const model = defineModel<string>({ default: '' })
defineProps<{ id: string; invalid?: boolean; autocomplete?: string; placeholder?: string }>()
</script>

<template>
  <Password
    v-model="model"
    :input-id="id"
    :invalid="invalid"
    :feedback="false"
    :placeholder="placeholder"
    :input-props="{
      autocomplete: autocomplete ?? 'current-password',
      'aria-describedby': `${id}-help ${id}-error`,
    }"
    toggle-mask
    fluid
  />
</template>
