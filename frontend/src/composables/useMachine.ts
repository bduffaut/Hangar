import type { SystemInfo } from '@hangar/shared'
import { ref } from 'vue'
import { api } from '../api/client.ts'

// The machine's name and system, for the home screen. Asked once per page load: it does not change
// while the dashboard is open, and the answer costs Hangar a few Docker queries.
const machine = ref<SystemInfo | null>(null)
let asked = false

export function useMachine(enabled: boolean) {
  if (enabled && !asked) {
    asked = true
    void api('systemInfo')
      .then((info) => (machine.value = info))
      .catch(() => (asked = false))
  }
  return machine
}
