<script setup lang="ts">
import ToggleSwitch from 'primevue/toggleswitch'

const model = defineModel<boolean>({ default: false })
defineProps<{ id: string; disabled?: boolean }>()
</script>

<template>
  <ToggleSwitch v-model="model" :input-id="id" :disabled="disabled" />
</template>
