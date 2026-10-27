<script setup lang="ts">
import { toastCopy } from '@hangar/shared'
import { onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { useLiveStore } from './stores/live.ts'
import { useProjectsStore } from './stores/projects.ts'
import { useSessionStore } from './stores/session.ts'
import { BaseConfirmHost, BaseToaster, useNotify } from './ui/index.ts'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const live = useLiveStore()
const projects = useProjectsStore()
const notify = useNotify()

// While signed in: keep live updates connected and announce deployments that finish.
watch(
  () => session.signedIn,
  async (signedIn) => {
    if (!signedIn) {
      live.disconnect()
      if (!route.meta.public) await router.push({ name: 'login', query: { next: route.fullPath } })
      return
    }
    live.connect()
    if (!projects.loaded) await projects.load().catch(() => {})
  },
  { immediate: true },
)

const stop = live.onDeployment((deployment) => {
  const name = projects.byId.get(deployment.projectId)?.name ?? 'The app'
  if (deployment.status === 'ready')
    notify.success(toastCopy.live(name), `Deployment #${deployment.number}`)
  if (deployment.status === 'failed')
    notify.error(toastCopy.failed(name), `Deployment #${deployment.number}`)
})
onBeforeUnmount(stop)
</script>

<template>
  <AppShell v-if="route.meta.shell && session.signedIn">
    <RouterView />
  </AppShell>
  <RouterView v-else />
  <BaseToaster />
  <BaseConfirmHost />
</template>
