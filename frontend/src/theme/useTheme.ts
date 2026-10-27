import { ref, watchEffect } from 'vue'
import { DARK_CLASS } from './css.ts'

export type ThemePreference = 'system' | 'dark' | 'light'

const STORAGE_KEY = 'hangar.theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'system' || stored === 'light' ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

/** Dark by default; light or matching the system are options. Remembered per browser. */
const preference = ref<ThemePreference>(readPreference())
const systemPrefersDark = ref(systemDark.matches)
systemDark.addEventListener('change', (event) => (systemPrefersDark.value = event.matches))

export const isDark = ref(true)

watchEffect(() => {
  isDark.value =
    preference.value === 'dark' || (preference.value === 'system' && systemPrefersDark.value)
  document.documentElement.classList.toggle(DARK_CLASS, isDark.value)
})

export function useTheme() {
  return {
    preference,
    isDark,
    setPreference(next: ThemePreference) {
      preference.value = next
      try {
        if (next === 'dark') localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Private browsing: the choice lasts for this visit.
      }
    },
  }
}
