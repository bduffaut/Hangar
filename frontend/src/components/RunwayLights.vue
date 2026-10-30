<script setup lang="ts">
import { type DeploymentStatus, statusCopy } from '@hangar/shared'
import { computed } from 'vue'

// A project's recent deployments as a row of runway lights, oldest on the left. Empty slots stay
// unlit so the row always has the same length and rows line up across cards.
const props = withDefaults(
  defineProps<{
    recent: { id: string; number: number; status: DeploymentStatus }[]
    slots?: number
  }>(),
  { slots: 12 },
)

const lights = computed(() => {
  const filled = props.recent.slice(-props.slots)
  const empty = Array.from({ length: props.slots - filled.length }, () => null)
  return [...empty, ...filled]
})

const summary = computed(() => {
  if (props.recent.length === 0) return 'No deployments yet'
  const counts = new Map<string, number>()
  for (const d of props.recent) {
    const label = statusCopy[d.status].label
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return `Last ${props.recent.length} deployments: ${[...counts].map(([l, n]) => `${n} ${l}`).join(', ')}`
})
</script>

<template>
  <div class="hg-runway" role="img" :aria-label="summary">
    <span
      v-for="(light, i) in lights"
      :key="light?.id ?? `empty-${i}`"
      v-hint.top="
        light
          ? `#${light.number}: ${statusCopy[light.status].label}, ${statusCopy[light.status].meaning.toLowerCase()}`
          : undefined
      "
      class="hg-light"
      :class="
        light
          ? [
              `is-${light.status}`,
              ['queued', 'building', 'deploying'].includes(light.status) && 'is-live',
            ]
          : 'is-empty'
      "
    />
  </div>
</template>

<style scoped>
.hg-runway {
  display: grid;
  grid-template-columns: repeat(v-bind('props.slots'), 1fr);
  gap: 0.3rem;
  align-items: center;
  padding: 0.4rem 0;
}
.hg-light {
  --tone: var(--hg-status-queued);
  height: 0.45rem;
  border-radius: 50%;
  aspect-ratio: 1;
  justify-self: center;
  background: var(--tone);
}
.is-empty {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--hg-line);
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
.is-live {
  animation: approach 1.2s ease-in-out infinite;
}
@keyframes approach {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0.4rem var(--tone);
  }
  50% {
    opacity: 0.35;
    box-shadow: none;
  }
}
</style>
