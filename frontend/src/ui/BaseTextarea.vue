<script setup lang="ts">
import Textarea from 'primevue/textarea'

const model = defineModel<string>({ default: '' })
defineProps<{ id: string; rows?: number; mono?: boolean; placeholder?: string }>()
</script>

<template>
  <Textarea
    :id="id"
    v-model="model"
    :rows="rows ?? 3"
    :placeholder="placeholder"
    auto-resize
    fluid
    spellcheck="false"
    :class="{ 'hg-mono': mono }"
  />
</template>

<style scoped>
.hg-mono {
  font-family: var(--hg-mono);
  font-size: var(--hg-size-sm);
}
</style>
