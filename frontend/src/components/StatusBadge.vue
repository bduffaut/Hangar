<script setup lang="ts">
import { type DeploymentStatus, statusCopy } from '@hangar/shared'
import { computed } from 'vue'

// A deployment status: a colored waypoint mark and its themed label, with the plain meaning on hover and
// for screen readers.
const props = defineProps<{ status: DeploymentStatus; size?: 'sm' | 'md' }>()
const copy = computed(() => statusCopy[props.status])
const inProgress = computed(() => ['queued', 'building', 'deploying'].includes(props.status))
</script>

<template>
  <span
    v-hint.top="copy.meaning"
    tabindex="0"
    class="hg-status"
    :class="[`is-${status}`, size === 'sm' && 'is-small']"
    :data-status="status"
  >
    <span class="hg-status-dot" :class="{ 'is-live': inProgress }" aria-hidden="true" />
    <span>{{ copy.label }}</span>
    <span class="hg-visually-hidden">: {{ copy.meaning }}</span>
  </span>
</template>

<style scoped>
.hg-status {
  --tone: var(--hg-status-queued);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0.6rem 0.2rem 0.55rem;
  border-radius: var(--hg-radius-sm);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  color: var(--hg-ink);
  font-family: var(--hg-data);
  font-size: var(--hg-size-xs);
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.is-small {
  padding: 0.1rem 0.45rem 0.1rem 0.4rem;
}
.is-building {
  --tone: var(--hg-status-building);
}
.is-deploying {
  --tone: var(--hg-status-deploying);
}
.is-ready {
  --tone: var(--hg-status-ready);
}
.is-failed {
  --tone: var(--hg-status-failed);
}
.is-cancelled {
  --tone: var(--hg-status-cancelled);
}
/* A waypoint diamond in the status color. */
.hg-status-dot {
  width: 0.42rem;
  height: 0.42rem;
  transform: rotate(45deg);
  background: var(--tone);
}
.is-live {
  animation: runway-pulse 1.6s ease-in-out infinite;
}
@keyframes runway-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--tone) 60%, transparent);
  }
  50% {
    box-shadow: 0 0 0 0.3rem color-mix(in srgb, var(--tone) 0%, transparent);
  }
}
</style>
