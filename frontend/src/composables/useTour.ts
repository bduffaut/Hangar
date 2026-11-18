import { guideCopy } from '@hangar/shared'
import { computed, ref } from 'vue'
import { askToSignUp, isDemo } from '../demo/mode.ts'

// The first-visit tour of the home screen. Each step points at an element marked with
// data-tour="<target>". It runs once per browser and can be restarted from the Guide.
const STORAGE_KEY = 'hangar.tour-done'
/** On the tour without an account it runs once per browser tab, then asks to sign up. */
const DEMO_KEY = 'hangar.tour-demo-done'

const step = ref<number | null>(null)

function remembered(): boolean {
  try {
    if (isDemo()) return sessionStorage.getItem(DEMO_KEY) === '1'
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** `completed`: the last step was read, rather than the tour skipped. */
function finish(completed = false) {
  const wasOpen = step.value !== null
  step.value = null
  if (isDemo() && wasOpen && completed) askToSignUp('tour-done')
  try {
    if (isDemo()) {
      sessionStorage.setItem(DEMO_KEY, '1')
      return
    }
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
    current: computed(() => (step.value === null ? null : (steps[step.value] ?? null))),
    start: () => (step.value = 0),
    startIfNew: () => {
      if (!remembered()) step.value = 0
    },
    next: () => {
      if (step.value === null) return
      if (step.value >= steps.length - 1) finish(true)
      else step.value++
    },
    finish: () => finish(),
  }
}
