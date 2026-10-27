<script setup lang="ts">
import { brand } from '@hangar/shared'

// The logo: a small plane parked inside an open hangar. Colors come from the theme.
withDefaults(defineProps<{ size?: number; withName?: boolean }>(), { size: 28, withName: true })
</script>

<template>
  <span class="hg-brand">
    <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M3 28V13L16 5l13 8v15"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linejoin="round"
      />
      <path
        d="M8 28V17h16v11"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        opacity="0.45"
      />
      <path
        d="M16 15.5c.9 0 1.3.6 1.3 1.4v3.2l5.2 2.4v1.7l-5.2-1.3v2.6l1.6 1.2v1.3L16 27.3l-2.9.7v-1.3l1.6-1.2v-2.6l-5.2 1.3v-1.7l5.2-2.4v-3.2c0-.8.4-1.4 1.3-1.4Z"
        fill="var(--hg-accent)"
      />
    </svg>
    <span v-if="withName" class="hg-brand-name">{{ brand.name }}</span>
  </span>
</template>

<style scoped>
.hg-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-2);
  color: var(--hg-ink);
}
.hg-brand-name {
  font-stretch: 125%;
  font-weight: var(--hg-weight-bold);
  font-size: var(--hg-size-md);
  letter-spacing: 0.01em;
}
</style>
