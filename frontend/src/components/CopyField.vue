<script setup lang="ts">
import { ref } from 'vue'
import { useClipboard } from '../composables/useClipboard.ts'
import { BaseButton } from '../ui/index.ts'

// A value shown in full with a copy button; secrets stay masked until revealed. `wrap` lets a long
// value (a command) break over lines, so all of it stays readable on a phone.
const props = defineProps<{ value: string; secret?: boolean; label: string; wrap?: boolean }>()
const revealed = ref(!props.secret)
const copy = useClipboard()
</script>

<template>
  <div class="hg-copy" :class="{ 'is-wrapped': wrap }">
    <code class="hg-copy-value" :aria-label="label">{{ revealed ? value : '•'.repeat(24) }}</code>
    <BaseButton
      v-if="secret"
      size="sm"
      variant="ghost"
      :icon="revealed ? 'eyeOff' : 'eye'"
      :aria-label="revealed ? `Hide ${label}` : `Show ${label}`"
      @click="revealed = !revealed"
    />
    <BaseButton
      size="sm"
      variant="ghost"
      icon="copy"
      :aria-label="`Copy ${label}`"
      @click="copy(value)"
    />
  </div>
</template>

<style scoped>
.hg-copy {
  display: flex;
  align-items: center;
  gap: var(--hg-space-1);
  padding: var(--hg-space-1) var(--hg-space-1) var(--hg-space-1) var(--hg-space-3);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-md);
  background: var(--hg-raised);
  min-width: 0;
}
.hg-copy-value {
  flex: 1;
  overflow-x: auto;
  white-space: nowrap;
  font-size: var(--hg-size-sm);
}
.is-wrapped {
  align-items: flex-start;
}
.is-wrapped .hg-copy-value {
  padding: var(--hg-space-1) 0;
  overflow-x: visible;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
</style>
