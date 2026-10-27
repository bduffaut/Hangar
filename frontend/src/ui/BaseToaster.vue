<script setup lang="ts">
import Toast from 'primevue/toast'
import { onBeforeUnmount, ref } from 'vue'

// Bottom right on wide screens; at the top on phones, where the bottom holds the page's buttons.
const narrow = window.matchMedia('(max-width: 40rem)')
type Position = 'top-center' | 'bottom-right'
const position = ref<Position>(narrow.matches ? 'top-center' : 'bottom-right')
const update = (event: MediaQueryListEvent) =>
  (position.value = event.matches ? 'top-center' : 'bottom-right')
narrow.addEventListener('change', update)
onBeforeUnmount(() => narrow.removeEventListener('change', update))
</script>

<template>
  <Toast :position="position" />
</template>
