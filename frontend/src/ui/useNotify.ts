import { useToast } from 'primevue/usetoast'
import { signUpPrompt } from '../demo/mode.ts'

/** Short confirmations and errors in the corner of the screen. */
export function useNotify() {
  const toast = useToast()
  const show = (
    severity: 'success' | 'info' | 'warn' | 'error',
    summary: string,
    detail?: string,
  ) => toast.add({ severity, summary, detail, life: severity === 'error' ? 8000 : 3500 })
  return {
    success: (summary: string, detail?: string) => show('success', summary, detail),
    info: (summary: string, detail?: string) => show('info', summary, detail),
    // On the tour, a refused action opens the sign-up prompt instead.
    error: (summary: string, detail?: string) => {
      if (!signUpPrompt.value) show('error', summary, detail)
    },
  }
}
