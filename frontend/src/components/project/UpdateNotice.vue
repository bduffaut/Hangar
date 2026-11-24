<script setup lang="ts">
import {
  type AppVersionView,
  imageRepository,
  isMemberCatalogApp,
  type ProjectView,
  toastCopy,
  updateCopy,
} from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, messageOf } from '../../api/client.ts'
import { useProjectsStore } from '../../stores/projects.ts'
import { useSessionStore } from '../../stores/session.ts'
import { BaseButton, useNotify } from '../../ui/index.ts'

// A newer version of an image app's image (D47): said once on its page, with the update one click
// away for whoever may change the image (admins, or anyone for a standard catalog app, D43).
// "Not now" hides this version until the next one comes out.
const props = defineProps<{ project: ProjectView }>()
const session = useSessionStore()
const projects = useProjectsStore()
const router = useRouter()
const notify = useNotify()

const version = ref<AppVersionView | null>(null)
const busy = ref(false)
const dismissKey = computed(() => `hangar.update.${props.project.id}`)
const dismissed = ref<string | null>(null)
const canUpdate = computed(
  () => session.isAdmin || isMemberCatalogApp(props.project.catalogId, props.project.image),
)
const shown = computed(
  () => version.value?.newest && version.value.current && dismissed.value !== version.value.newest,
)

onMounted(async () => {
  try {
    dismissed.value = localStorage.getItem(dismissKey.value)
  } catch {
    dismissed.value = null
  }
  version.value = await api('projectVersion', { params: { id: props.project.id } }).catch(
    () => null,
  )
})

function dismiss() {
  dismissed.value = version.value!.newest
  try {
    localStorage.setItem(dismissKey.value, version.value!.newest!)
  } catch {
    // Private browsing: it stays hidden until the page reloads.
  }
}

async function update() {
  const newest = version.value!.newest!
  busy.value = true
  try {
    const image = `${imageRepository(props.project.image!)}:${newest}`
    const id = props.project.id
    projects.upsert(await api('updateProject', { params: { id }, body: { image } }))
    const deployment = await api('deployProject', { params: { id } })
    notify.success(toastCopy.deployQueued, `#${deployment.number}`)
    await router.push({ name: 'deployment', params: { id: deployment.id } })
  } catch (error) {
    notify.error(messageOf(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="shown" class="hg-update" aria-label="Update available">
    <div class="hg-update-text">
      <strong>{{ updateCopy.available(version!.newest!, version!.current!) }}</strong>
      <span class="hg-muted">{{ canUpdate ? updateCopy.note : updateCopy.askAdmin }}</span>
    </div>
    <div class="hg-update-actions">
      <BaseButton variant="ghost" size="sm" :label="updateCopy.dismiss" @click="dismiss" />
      <BaseButton
        v-if="canUpdate"
        variant="primary"
        size="sm"
        icon="download"
        :label="updateCopy.action(version!.newest!)"
        :loading="busy"
        @click="update"
      />
    </div>
  </section>
</template>

<style scoped>
.hg-update {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--hg-space-3);
  padding: var(--hg-space-3) var(--hg-space-4);
  margin-bottom: var(--hg-space-5);
  border: 1px solid color-mix(in srgb, var(--hg-status-building) 40%, var(--hg-line));
  border-left: 2px solid var(--hg-status-building);
  background: var(--hg-panel);
}
.hg-update-text {
  display: grid;
  gap: var(--hg-space-1);
  font-size: var(--hg-size-sm);
}
.hg-update-actions {
  display: flex;
  gap: var(--hg-space-2);
}
</style>
