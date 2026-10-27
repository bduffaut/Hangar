<script setup lang="ts">
import { guideCopy } from '@hangar/shared'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTour } from '../composables/useTour.ts'
import { BaseButton } from '../ui/index.ts'

const tour = useTour()
const box = ref<{ top: number; left: number; width: number; height: number } | null>(null)
const card = ref<HTMLElement | null>(null)

function measure() {
  const target = tour.current.value
    ? document.querySelector<HTMLElement>(`[data-tour="${tour.current.value.target}"]`)
    : null
  if (!target) {
    box.value = null
    return
  }
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const rect = target.getBoundingClientRect()
  box.value = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

watch(
  () => tour.step.value,
  async (step) => {
    if (step === null) return
    await nextTick()
    measure()
    // Measure again once the smooth scroll settles.
    setTimeout(measure, 350)
    card.value?.focus()
  },
  { immediate: true },
)

const onKey = (event: KeyboardEvent) => {
  if (tour.step.value !== null && event.key === 'Escape') tour.finish()
}
window.addEventListener('keydown', onKey)
window.addEventListener('resize', measure)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', measure)
})

const cardStyle = () => {
  if (!box.value) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const below = box.value.top + box.value.height + 12
  const fitsBelow = below + 180 < window.innerHeight
  return {
    top: `${fitsBelow ? below : Math.max(12, box.value.top - 192)}px`,
    left: `${Math.min(Math.max(12, box.value.left), window.innerWidth - 332)}px`,
  }
}
</script>

<template>
  <div
    v-if="tour.current.value"
    class="hg-tour"
    role="dialog"
    aria-modal="true"
    :aria-label="tour.current.value.title"
  >
    <div
      v-if="box"
      class="hg-tour-spotlight"
      :style="{
        top: `${box.top - 6}px`,
        left: `${box.left - 6}px`,
        width: `${box.width + 12}px`,
        height: `${box.height + 12}px`,
      }"
    />
    <div ref="card" class="hg-tour-card" tabindex="-1" :style="cardStyle()">
      <p class="hg-tour-progress">{{ (tour.step.value ?? 0) + 1 }} of {{ tour.steps.length }}</p>
      <h2>{{ tour.current.value.title }}</h2>
      <p>{{ tour.current.value.body }}</p>
      <div class="hg-tour-actions">
        <BaseButton variant="ghost" size="sm" :label="guideCopy.tourSkip" @click="tour.finish()" />
        <BaseButton
          variant="primary"
          size="sm"
          :label="
            (tour.step.value ?? 0) >= tour.steps.length - 1
              ? guideCopy.tourDone
              : guideCopy.tourNext
          "
          @click="tour.next()"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hg-tour {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.hg-tour-spotlight {
  position: fixed;
  border-radius: var(--hg-radius-lg);
  box-shadow: 0 0 0 9999px rgba(5, 10, 20, 0.62);
  outline: 2px solid var(--hg-accent);
  transition: all var(--hg-motion-base) var(--hg-motion-easing);
  pointer-events: none;
}
.hg-tour-card {
  position: fixed;
  width: min(20rem, calc(100vw - 1.5rem));
  display: grid;
  gap: var(--hg-space-2);
  padding: var(--hg-space-4);
  border-radius: var(--hg-radius-lg);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  color: var(--hg-ink);
}
.hg-tour-card h2 {
  font-size: var(--hg-size-md);
}
.hg-tour-progress {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
.hg-tour-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--hg-space-2);
  margin-top: var(--hg-space-2);
}
</style>
