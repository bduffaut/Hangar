import type { Session } from '@hangar/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, onUnauthorized, setCsrfToken } from '../api/client.ts'

/** Who is signed in, and whether the server still needs its first-run setup. */
export const useSessionStore = defineStore('session', () => {
  const session = ref<Session | null>(null)
  const needsSetup = ref<boolean | null>(null)
  const loaded = ref(false)

  const signedIn = computed(() => session.value !== null)
  const username = computed(() => session.value?.user.username ?? null)

  function apply(next: Session | null) {
    session.value = next
    setCsrfToken(next?.csrfToken ?? null)
  }

  onUnauthorized(() => apply(null))

  /** Learns the current state once, on first navigation. */
  async function load() {
    if (loaded.value) return
    needsSetup.value = (await api('setupStatus')).needsSetup
    if (!needsSetup.value) apply(await api('me').catch(() => null))
    loaded.value = true
  }

  return {
    session,
    needsSetup,
    signedIn,
    username,
    load,
    async completeSetup(body: { setupCode: string; username: string; password: string }) {
      apply(await api('setupComplete', { body }))
      needsSetup.value = false
    },
    async login(username: string, password: string) {
      apply(await api('login', { body: { username, password } }))
    },
    async logout() {
      await api('logout').catch(() => {})
      apply(null)
    },
  }
})
