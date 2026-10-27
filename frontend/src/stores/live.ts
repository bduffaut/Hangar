import type { DeploymentView } from '@hangar/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { openStream, type Stream } from '../api/streams.ts'
import { useProjectsStore } from './projects.ts'

type Listener = (deployment: DeploymentView) => void

/**
 * One connection to the server's status stream while signed in. It keeps the projects store
 * current and lets pages and toasts react to status changes.
 */
export const useLiveStore = defineStore('live', () => {
  const connected = ref(false)
  const active = ref<DeploymentView[]>([])
  const listeners = new Set<Listener>()
  let stream: Stream | null = null

  function apply(deployment: DeploymentView) {
    useProjectsStore().applyDeployment(deployment)
    const others = active.value.filter((d) => d.id !== deployment.id)
    active.value = ['queued', 'building', 'deploying'].includes(deployment.status)
      ? [...others, deployment]
      : others
    for (const listener of listeners) listener(deployment)
  }

  return {
    connected,
    active,
    connect() {
      if (stream) return
      stream = openStream(
        '/api/events',
        {
          snapshot: (data: { deployments: DeploymentView[] }) => {
            connected.value = true
            active.value = data.deployments
            for (const d of data.deployments) useProjectsStore().applyDeployment(d)
          },
          status: (data: { deployment: DeploymentView }) => apply(data.deployment),
        },
        { onError: () => (connected.value = false) },
      )
    },
    disconnect() {
      stream?.close()
      stream = null
      connected.value = false
    },
    /** Returns a function that stops listening. */
    onDeployment(listener: Listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})
