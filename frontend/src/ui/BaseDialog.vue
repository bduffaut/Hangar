<script setup lang="ts">
import Dialog from 'primevue/dialog'

const visible = defineModel<boolean>('visible', { default: false })
defineProps<{ title: string; width?: string }>()
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="title"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: width ?? '32rem', maxWidth: 'calc(100vw - 2rem)' }"
  >
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </Dialog>
</template>
