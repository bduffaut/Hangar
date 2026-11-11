import type { ServerView } from '@hangar/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, setServerPrefix } from '../api/client.ts'

const STORAGE_KEY = 'hangar.server'
/** This machine itself: the Hangar the page came from. */
export const LOCAL = 'local'

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * The servers this person can fly from (D38), and which one the dashboard is showing. Projects,
 * deployments, logs, and settings all come from the chosen one.
 */
export const useServersStore = defineStore('servers', () => {
  const servers = ref<ServerView[]>([])
  const current = ref<string>(LOCAL)
  const loaded = ref(false)
  /** May use this machine (the owner and invited people). */
  const localAllowed = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  const remote = computed(() => servers.value.find((s) => s.id === current.value) ?? null)
  const isLocal = computed(() => current.value === LOCAL)
  /** There is somewhere to deploy: this machine, or a connected server. */
  const hasServer = computed(() => localAllowed.value || servers.value.length > 0)

  function apply(id: string) {
    current.value = id
    setServerPrefix(id === LOCAL ? '' : `/s/${id}`)
  }

  async function refresh() {
    servers.value = await api('listServers').catch(() => servers.value)
  }

  return {
    servers,
    current,
    remote,
    isLocal,
    loaded,
    hasServer,
    localAllowed,
    refresh,
    /** Once per page load, after sign-in: picks the remembered server if it is still there. */
    async load(localAccess: boolean) {
      localAllowed.value = localAccess
      await refresh()
      const wanted = remembered()
      const valid = (id: string | null) =>
        id !== null && (id === LOCAL ? localAccess : servers.value.some((s) => s.id === id))
      apply(valid(wanted) ? wanted! : localAccess ? LOCAL : (servers.value[0]?.id ?? LOCAL))
      loaded.value = true
      // Online dots stay current without a page load.
      timer ??= setInterval(() => void refresh(), 15_000)
    },
    /** Switches server. A full load, so nothing of the previous server stays on screen. */
    choose(id: string, to = '/') {
      try {
        localStorage.setItem(STORAGE_KEY, id)
      } catch {
        // Private browsing: the choice lasts for this page only.
      }
      window.location.assign(to)
    },
    reset() {
      if (timer) clearInterval(timer)
      timer = null
      servers.value = []
      loaded.value = false
      apply(LOCAL)
    },
  }
})
