<script setup lang="ts">
import Button from 'primevue/button'
import { computed } from 'vue'
import BaseIcon, { type IconName } from './BaseIcon.vue'

const props = withDefaults(
  defineProps<{
    label?: string
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    icon?: IconName
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
    /** Accessible name when the button shows only an icon. */
    ariaLabel?: string
    fluid?: boolean
    /** `console`: light text for dark terminal panels such as the log viewer. */
    tone?: 'default' | 'console'
  }>(),
  { variant: 'secondary', size: 'md', type: 'button' },
)
defineEmits<{ click: [event: MouseEvent] }>()

const library = computed(() => ({
  severity:
    props.variant === 'danger' ? 'danger' : props.variant === 'primary' ? undefined : 'secondary',
  variant: props.variant === 'ghost' ? ('text' as const) : undefined,
  size: props.size === 'sm' ? ('small' as const) : undefined,
}))
</script>

<template>
  <Button
    :type="type"
    :label="label"
    :severity="library.severity"
    :variant="library.variant"
    :size="library.size"
    :loading="loading"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :fluid="fluid"
    class="hg-button"
    :class="{
      'is-console': tone === 'console',
      'is-unavailable': variant === 'primary' && disabled && !loading,
    }"
    @click="$emit('click', $event)"
  >
    <template v-if="icon" #icon>
      <BaseIcon :name="icon" :size="size === 'sm' ? 16 : 18" />
    </template>
    <slot />
  </Button>
</template>

<style scoped>
.hg-button {
  font-weight: var(--hg-weight-medium);
  gap: var(--hg-space-2);
}
/* A faded yellow reads as broken; an unavailable primary action goes plain instead. */
.hg-button.is-unavailable {
  background: var(--hg-raised);
  border-color: var(--hg-line);
  color: var(--hg-ink-muted);
  opacity: 1;
}
.hg-button.is-console {
  color: var(--hg-console-ink);
}
</style>
