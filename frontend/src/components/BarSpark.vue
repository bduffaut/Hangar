<script setup lang="ts">
import { computed } from 'vue'

// Thin bars for a recent series, newest on the right and in the accent. `max` fixes the scale
// (100 for percentages); otherwise it follows the largest value. Decorative: the reading next to
// it carries the number for screen readers.
const props = withDefaults(
  defineProps<{ values: (number | null)[]; max?: number; bars?: number }>(),
  {
    bars: 32,
  },
)

const shown = computed(() => {
  const tail = props.values.slice(-props.bars)
  return [...Array(Math.max(0, props.bars - tail.length)).fill(null), ...tail] as (number | null)[]
})
const top = computed(() => props.max ?? Math.max(1, ...shown.value.map((v) => v ?? 0)))
</script>

<template>
  <span class="hg-spark" aria-hidden="true">
    <span
      v-for="(value, i) in shown"
      :key="i"
      :class="{ 'is-now': i === shown.length - 1 && value !== null, 'is-empty': value === null }"
      :style="{ height: value === null ? '2px' : `${Math.max(6, (value / top) * 100)}%` }"
    />
  </span>
</template>

<style scoped>
.hg-spark {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 1.75rem;
  width: 100%;
}
.hg-spark span {
  flex: 1;
  min-width: 2px;
  background: color-mix(in srgb, var(--hg-status-building) 45%, transparent);
  transition: height var(--hg-motion-base) var(--hg-motion-easing);
}
.hg-spark span.is-now {
  background: var(--hg-accent);
}
.hg-spark span.is-empty {
  background: var(--hg-line);
}
</style>
