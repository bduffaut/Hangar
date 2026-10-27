import { guideCopy } from '@hangar/shared'
import { computed, ref } from 'vue'

// The first-visit tour of the home screen. Each step points at an element marked with
// data-tour="<target>". It runs once per browser and can be restarted from the Guide.
const STORAGE_KEY = 'hangar.tour-done'

const step = ref<number | null>(null)

function remembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function finish() {
  step.value = null
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Private browsing: the tour may show again next visit.
  }
}

export function useTour() {
  const steps = guideCopy.tour
  return {
    steps,
    step,
    current: computed(() => (step.value === null ? null : steps[step.value] ?? null)),
    start: () => (step.value = 0),
    startIfNew: () => {
      if (!remembered()) step.value = 0
    },
    next: () => {
      if (step.value === null) return
      if (step.value >= steps.length - 1) finish()
      else step.value++
    },
    finish,
  }
}
