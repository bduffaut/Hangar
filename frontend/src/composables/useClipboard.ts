import { toastCopy } from '@hangar/shared'
import { useNotify } from '../ui/index.ts'

/**
 * The Clipboard API exists only on secure pages (https or localhost), and the Control Tower is
 * usually plain http on the local network, so fall back to copying a selected hidden textarea.
 */
function copyWithSelection(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } finally {
    area.remove()
  }
}

export function useClipboard() {
  const notify = useNotify()
  return async (text: string, message: string = toastCopy.copied) => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text)
      else if (!copyWithSelection(text)) throw new Error('copy refused')
      notify.success(message)
    } catch {
      notify.error('Copying is blocked in this browser. Select the text and copy it instead.')
    }
  }
}
