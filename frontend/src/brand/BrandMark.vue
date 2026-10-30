<script setup lang="ts">
import { brand } from '@hangar/shared'

// The logo: a hangar's arch drawn in chart linework, with the magenta aircraft symbol of a
// navigation display rolling out of its door. The arch follows the text color; the symbol is
// always magenta.
withDefaults(defineProps<{ size?: number; withName?: boolean }>(), { size: 26, withName: true })
</script>

<template>
  <span class="hg-brand">
    <svg :width="size" :height="size" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4 27V17C4 10.9 9.4 6 16 6s12 4.9 12 11v10"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linejoin="round"
      />
      <path d="M1.5 27h29" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
      <path d="M16 13.5 20.5 23h-9Z" fill="var(--hg-accent)" />
    </svg>
    <span v-if="withName" class="hg-brand-name">{{ brand.name }}</span>
  </span>
</template>

<style scoped>
.hg-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--hg-ink);
}
.hg-brand svg {
  flex: none;
}
.hg-brand-name {
  font-weight: var(--hg-weight-bold);
  font-size: var(--hg-size-md);
  letter-spacing: 0.03em;
}
</style>
