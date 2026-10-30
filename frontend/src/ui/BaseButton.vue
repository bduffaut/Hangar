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
/*
 * Hover is felt more than seen: the icon lifts a pixel on primary buttons, like a nose rotating
 * on takeoff; other buttons draw a short magenta course line under the label.
 */
.hg-button {
  position: relative;
  font-weight: var(--hg-weight-regular);
  gap: var(--hg-space-2);
  transition:
    background-color var(--hg-motion-fast) var(--hg-motion-easing),
    border-color var(--hg-motion-fast) var(--hg-motion-easing),
    color var(--hg-motion-fast) var(--hg-motion-easing),
    transform var(--hg-motion-fast) var(--hg-motion-easing);
}
.hg-button:not(:disabled):active {
  transform: translateY(1px);
}
.hg-button .hg-icon {
  transition: transform var(--hg-motion-base) var(--hg-motion-easing);
}
.hg-button:not(.p-button-secondary, .p-button-text, .p-button-danger, :disabled):hover .hg-icon {
  transform: translate(1px, -1px);
}
.hg-button::after {
  content: '';
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  bottom: 3px;
  height: 1px;
  background: var(--hg-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--hg-motion-base) var(--hg-motion-easing);
  pointer-events: none;
}
.hg-button.p-button-secondary:not(:disabled):hover::after,
.hg-button.p-button-text:not(:disabled):hover::after {
  transform: scaleX(1);
}
.hg-button.p-button-icon-only::after {
  left: 0.6rem;
  right: 0.6rem;
}
/* A faded primary reads as broken; an unavailable primary action goes plain instead. */
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
