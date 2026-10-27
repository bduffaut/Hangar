<script setup lang="ts">
import Skeleton from 'primevue/skeleton'

defineProps<{ width?: string; height?: string; shape?: 'rectangle' | 'circle' }>()
</script>

<template>
  <Skeleton :width="width" :height="height ?? '1rem'" :shape="shape" />
</template>
