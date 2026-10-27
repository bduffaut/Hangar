import { onBeforeUnmount, ref } from 'vue'

/** The current time, updated every `intervalMs`, for relative times and running timers. */
export function useNow(intervalMs = 15_000) {
  const now = ref(Date.now())
  const timer = setInterval(() => (now.value = Date.now()), intervalMs)
  onBeforeUnmount(() => clearInterval(timer))
  return now
}
