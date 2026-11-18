import { ref } from 'vue'

// The tour without an account (/tour). While it is on, the dashboard's requests are answered from
// demo/data.ts instead of the server, and anything that would change something asks the visitor
// to sign up. It lasts for the browser tab (sessionStorage), so switching server, which reloads
// the page, stays inside the tour.
const KEY = 'hangar.tour'

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let active = read()

export const isDemo = () => active

export function enterDemo() {
  active = true
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // Private browsing: the tour lasts until the next full page load.
  }
}

/** Leaves the tour and loads `to` fresh, so nothing of the sample stays in memory. */
export function leaveDemo(to = '/') {
  active = false
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing was stored.
  }
  window.location.assign(to)
}

/** The sign-up prompt: what the visitor tried to do, or 'tour-done' after the last tour step. */
export const signUpPrompt = ref<string | null>(null)
export const askToSignUp = (reason: string) => (signUpPrompt.value = reason)
