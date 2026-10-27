<script setup lang="ts">
import { guideCopy } from '@hangar/shared'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTour } from '../composables/useTour.ts'
import { BaseButton } from '../ui/index.ts'

const tour = useTour()
interface Box {
  top: number
  left: number
  width: number
  height: number
}
const box = ref<Box | null>(null)
const card = ref<HTMLElement | null>(null)
const cardPosition = ref<{ top: number; left: number } | null>(null)

/** Space kept between the highlight, the card, and the window edges. */
const GAP = 12
const PAD = 6

function target() {
  const step = tour.current.value
  return step ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
}

// While the tour is open the highlight is re-measured every frame, so it stays on its target
// through smooth scrolling, data arriving and changing the layout, and window resizes.
let frame = 0
function track() {
  const element = target()
  if (element) {
    const r = element.getBoundingClientRect()
    const next = {
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    }
    const prev = box.value
    if (!prev || Object.entries(next).some(([k, v]) => Math.abs(prev[k as keyof Box] - v) > 0.5)) {
      box.value = next
    }
  } else if (box.value) {
    box.value = null
  }
  placeCard()
  frame = requestAnimationFrame(track)
}

/** Below the highlight if it fits, else above, else pinned to the bottom of the window. */
function placeCard() {
  const el = card.value
  if (!el) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = el.offsetWidth
  const h = el.offsetHeight
  const b = box.value
  let top: number
  let left: number
  if (!b) {
    top = (vh - h) / 2
    left = (vw - w) / 2
  } else {
    const below = b.top + b.height + GAP
    const above = b.top - GAP - h
    if (below + h <= vh - GAP) top = below
    else if (above >= GAP) top = above
    else top = vh - h - GAP
    // Line up with the highlight's left edge, or its right edge when it sits on the right.
    left = b.left + b.width / 2 > vw / 2 ? b.left + b.width - w : b.left
  }
  left = Math.min(Math.max(GAP, left), vw - w - GAP)
  top = Math.min(Math.max(GAP, top), vh - h - GAP)
  const prev = cardPosition.value
  if (!prev || Math.abs(prev.top - top) > 0.5 || Math.abs(prev.left - left) > 0.5) {
    cardPosition.value = { top, left }
  }
}

// Focus returns to where it was when the tour ends.
let returnFocus: HTMLElement | null = null
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

watch(
  () => tour.step.value,
  async (step, previous) => {
    if (step === null) {
      cancelAnimationFrame(frame)
      frame = 0
      box.value = null
      cardPosition.value = null
      returnFocus?.focus()
      returnFocus = null
      return
    }
    if (previous === null || previous === undefined)
      returnFocus = document.activeElement as HTMLElement | null
    await nextTick()
    target()?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
    if (!frame) frame = requestAnimationFrame(track)
    card.value?.focus({ preventScroll: true })
  },
  { immediate: true },
)

// Escape ends the tour; Tab stays inside the card while it is open.
const onKey = (event: KeyboardEvent) => {
  if (tour.step.value === null || !card.value) return
  if (event.key === 'Escape') {
    tour.finish()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = [...card.value.querySelectorAll<HTMLElement>('button:not([disabled])')]
  if (focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable.at(-1)!
  const inside = card.value.contains(document.activeElement)
  if (event.shiftKey && (document.activeElement === first || !inside)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
    event.preventDefault()
    first.focus()
  }
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  cancelAnimationFrame(frame)
})

const cardStyle = () =>
  cardPosition.value
    ? { top: `${cardPosition.value.top}px`, left: `${cardPosition.value.left}px` }
    : { top: '0', left: '0', visibility: 'hidden' as const }
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
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }"
    />
    <div v-else class="hg-tour-scrim" />
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
/* Positioned from the target every frame, so no transition: it would lag behind. */
.hg-tour-spotlight {
  position: fixed;
  border-radius: calc(var(--hg-radius-lg) + 4px);
  box-shadow: 0 0 0 200vmax var(--hg-scrim);
  outline: 2px solid var(--hg-accent);
  outline-offset: 0;
  pointer-events: none;
}
.hg-tour-scrim {
  position: fixed;
  inset: 0;
  background: var(--hg-scrim);
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
  border-top: 3px solid var(--hg-accent);
  color: var(--hg-ink);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
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
