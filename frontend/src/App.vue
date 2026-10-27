<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { useLiveStore } from './stores/live.ts'
import { useProjectsStore } from './stores/projects.ts'
import { useSessionStore } from './stores/session.ts'
import { authCopy, errorCopy, toastCopy } from '@hangar/shared'
import { BaseButton, BaseConfirmHost, BaseToaster, useNotify } from './ui/index.ts'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const live = useLiveStore()
const projects = useProjectsStore()
const notify = useNotify()

// While signed in: keep live updates connected and announce deployments that finish.
watch(
  () => session.signedIn,
  async (signedIn, wasSignedIn) => {
    if (!signedIn) {
      live.disconnect()
      projects.reset()
      // Only when a session ends while the app is open; the router guard handles first loads.
      if (wasSignedIn && !route.meta.public) {
        await router.push({ name: 'login', query: { next: route.fullPath, expired: '1' } })
      }
      return
    }
    live.connect()
    await projects.ensureLoaded().catch(() => {})
  },
  { immediate: true },
)

const stop = live.onDeployment((deployment, firstLive) => {
  const name = projects.byId.get(deployment.projectId)?.name ?? 'The app'
  if (deployment.status === 'ready' && firstLive) notify.success(toastCopy.firstLive, name)
  else if (deployment.status === 'ready')
    notify.success(toastCopy.live(name), `Deployment #${deployment.number}`)
  if (deployment.status === 'failed')
    notify.error(toastCopy.failed(name), `Deployment #${deployment.number}`)
})
onBeforeUnmount(stop)

const reload = () => window.location.reload()
</script>

<template>
  <main v-if="session.unreachable" class="hg-unreachable" role="alert">
    <h1>{{ authCopy.unreachableTitle }}</h1>
    <p class="hg-muted">{{ errorCopy.network }}</p>
    <BaseButton variant="primary" icon="restart" label="Try again" @click="reload" />
  </main>
  <AppShell v-else-if="route.meta.shell && session.signedIn">
    <RouterView />
  </AppShell>
  <RouterView v-else />
  <BaseToaster />
  <BaseConfirmHost />
</template>

<style scoped>
.hg-unreachable {
  max-width: var(--hg-width-narrow);
  margin: 15vh auto 0;
  padding: 0 var(--hg-space-5);
  display: grid;
  gap: var(--hg-space-4);
  justify-items: start;
}
</style>
