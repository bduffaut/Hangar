import type { DeploymentView } from '@hangar/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { openStream, type Stream, streamUrl } from '../api/streams.ts'
import { useProjectsStore } from './projects.ts'

/** `firstLive`: the project had never been live before this deployment. */
type Listener = (deployment: DeploymentView, firstLive: boolean) => void

/**
 * One connection to the server's status stream while signed in. It keeps the projects store
 * current, lets pages react to status changes, and catches up after a reconnection.
 */
export const useLiveStore = defineStore('live', () => {
  const connected = ref(false)
  const active = ref<DeploymentView[]>([])
  const listeners = new Set<Listener>()
  const reconnectListeners = new Set<() => void>()
  let stream: Stream | null = null

  function apply(deployment: DeploymentView) {
    const projects = useProjectsStore()
    const firstLive =
      deployment.status === 'ready' && !projects.byId.get(deployment.projectId)?.current
    projects.applyDeployment(deployment)
    const others = active.value.filter((d) => d.id !== deployment.id)
    active.value = ['queued', 'building', 'deploying'].includes(deployment.status)
      ? [...others, deployment]
      : others
    for (const listener of listeners) listener(deployment, firstLive)
  }

  return {
    connected,
    active,
    connect() {
      if (stream) return
      let catchingUp = false
      stream = openStream(
        streamUrl('events'),
        {
          snapshot: (data: { deployments: DeploymentView[] }) => {
            connected.value = true
            active.value = data.deployments
            for (const d of data.deployments) useProjectsStore().applyDeployment(d)
            if (catchingUp) {
              // Deployments may have finished while disconnected; reload and let pages refetch.
              void useProjectsStore()
                .load()
                .catch(() => {})
              for (const listener of reconnectListeners) listener()
            }
          },
          status: (data: { deployment: DeploymentView }) => apply(data.deployment),
        },
        {
          onOpen: (reconnect) => (catchingUp = reconnect),
          onError: () => (connected.value = false),
        },
      )
    },
    disconnect() {
      stream?.close()
      stream = null
      connected.value = false
      active.value = []
    },
    /** Returns a function that stops listening. */
    onDeployment(listener: Listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Runs after the stream reconnects, so pages can refetch what they show. */
    onReconnect(listener: () => void) {
      reconnectListeners.add(listener)
      return () => reconnectListeners.delete(listener)
    },
  }
})
