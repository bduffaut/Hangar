<script setup lang="ts">
import Message from 'primevue/message'

defineProps<{ tone?: 'info' | 'success' | 'warn' | 'error' }>()
</script>

<template>
  <Message
    :severity="tone ?? 'info'"
    :closable="false"
    class="hg-message"
    :class="`is-${tone ?? 'info'}`"
  >
    <slot />
  </Message>
</template>

<style scoped>
/* A note in the margin: body-size ink text, its tone shown by a rule on the left. */
.hg-message {
  --tone: var(--hg-link);
  background: color-mix(in srgb, var(--tone) 9%, transparent);
  border: 0;
  border-left: 3px solid var(--tone);
  border-radius: var(--hg-radius-sm);
  outline: 0;
  box-shadow: none;
}
.hg-message :deep(.p-message-text) {
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-regular);
  color: var(--hg-ink);
}
.hg-message :deep(.p-message-content) {
  padding: var(--hg-space-2) var(--hg-space-3);
}
.is-success {
  --tone: var(--hg-status-ready);
}
.is-warn {
  --tone: var(--hg-caution);
}
.is-error {
  --tone: var(--hg-danger);
}
</style>
