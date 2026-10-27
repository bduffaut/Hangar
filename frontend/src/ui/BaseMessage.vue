<script setup lang="ts">
import Message from 'primevue/message'

defineProps<{ tone?: 'info' | 'success' | 'warn' | 'error' }>()
</script>

<template>
  <Message :severity="tone ?? 'info'" :closable="false">
    <slot />
  </Message>
</template>
