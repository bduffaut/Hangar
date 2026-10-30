<script setup lang="ts">
import { BaseButton } from '../../ui/index.ts'

// The frame around every widget: its name at the top and, while customizing, a handle to drag it
// by and a button to take it off the board. Content fills the rest.
defineProps<{ title: string; editable: boolean; fit?: boolean }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <section class="hg-widget" :class="{ 'is-editing': editable, 'is-fit': fit }">
    <header class="hg-widget-head">
      <h2 class="hg-widget-title">{{ title }}</h2>
      <BaseButton
        v-if="editable"
        v-hint.top="`Remove ${title}`"
        variant="ghost"
        size="sm"
        icon="x"
        :aria-label="`Remove ${title}`"
        class="hg-widget-remove"
        @click="$emit('remove')"
      />
    </header>
    <div class="hg-widget-body"><slot /></div>
  </section>
</template>

<style scoped>
.hg-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-lg);
  transition: border-color var(--hg-motion-base) var(--hg-motion-easing);
}
.hg-widget.is-fit {
  height: auto;
}
.hg-widget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--hg-space-2);
  min-height: 2.25rem;
  padding: var(--hg-space-2) var(--hg-space-4) 0;
}
.hg-widget-title {
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-regular);
  letter-spacing: 0;
  color: var(--hg-ink-muted);
}
.hg-widget-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.hg-widget-remove {
  margin: -0.25rem -0.5rem -0.25rem 0;
}
/* Customizing: the frame is drawn like a chart's planned (dashed) route and its header is a handle. */
.is-editing {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--hg-accent) 55%, var(--hg-line));
}
.is-editing .hg-widget-head {
  cursor: grab;
}
.is-editing .hg-widget-head:active {
  cursor: grabbing;
}
:global(.dg-item--dragging) .hg-widget {
  border-style: solid;
  border-color: var(--hg-accent);
}
</style>
