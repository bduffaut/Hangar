<script setup lang="ts">
import ProgressSpinner from 'primevue/progressspinner'

defineProps<{ size?: string; label?: string }>()
</script>

<template>
  <ProgressSpinner
    :style="{ width: size ?? '1.5rem', height: size ?? '1.5rem' }"
    stroke-width="5"
    :aria-label="label ?? 'Loading'"
  />
</template>
