import { toastCopy } from '@hangar/shared'
import { useNotify } from '../ui/index.ts'

export function useClipboard() {
  const notify = useNotify()
  return async (text: string, message: string = toastCopy.copied) => {
    try {
      await navigator.clipboard.writeText(text)
      notify.success(message)
    } catch {
      notify.error('Copying is blocked in this browser. Select the text and copy it instead.')
    }
  }
}
