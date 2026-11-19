<script setup lang="ts">
import { type LibraryView, type ProjectView, type StorageView, toastCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api, messageOf } from '../../api/client.ts'
import { formatBytes } from '../../lib/format.ts'
import { useProjectsStore } from '../../stores/projects.ts'
import { useSessionStore } from '../../stores/session.ts'
import {
  BaseButton,
  BaseIcon,
  BaseInput,
  BaseMessage,
  BaseSelect,
  BaseSwitch,
  useNotify,
} from '../../ui/index.ts'
import HgPanel from '../HgPanel.vue'

// An app's storage (kept across deploys), the libraries it reads, and the graphics chip (D42).
// Libraries and the chip are an admin's to grant; anyone can give their app storage.
const props = defineProps<{ project: ProjectView }>()
const projects = useProjectsStore()
const session = useSessionStore()
const notify = useNotify()

interface VolumeRow {
  name: string
  mountPath: string
}
interface LibraryRow {
  libraryId: string | null
  mountPath: string
  writable: boolean
}

const volumes = ref<VolumeRow[]>(props.project.volumes.map((v) => ({ ...v })))
const libraries = ref<LibraryRow[]>(
  props.project.libraries.map((l) => ({
    libraryId: l.libraryId,
    mountPath: l.mountPath,
    writable: !l.readOnly,
  })),
)
const gpu = ref(props.project.gpu)

const storage = ref<StorageView | null>(null)
const known = ref<LibraryView[]>([])
const gpuAvailable = ref(false)
onMounted(async () => {
  storage.value = await api('projectStorage', { params: { id: props.project.id } }).catch(
    () => null,
  )
  if (session.isAdmin) {
    known.value = await api('listLibraries').catch(() => [])
    gpuAvailable.value = (await api('systemInfo').catch(() => null))?.gpu ?? false
  }
})

const sizeOf = (name: string) => {
  const bytes = storage.value?.volumes.find((v) => v.name === name)?.sizeBytes
  return bytes == null ? null : formatBytes(bytes)
}
const libraryOptions = computed(() =>
  known.value.map((l) => ({ label: `${l.name} (${l.path})`, value: l.id })),
)
const writableAllowed = (id: string | null) => known.value.find((l) => l.id === id)?.writable

function addVolume() {
  const used = new Set(volumes.value.map((v) => v.name))
  const name = ['data', 'config', 'files'].find((n) => !used.has(n)) ?? `data-${used.size + 1}`
  volumes.value.push({ name, mountPath: `/${name}` })
}
function addLibrary() {
  libraries.value.push({
    libraryId: known.value[0]?.id ?? null,
    mountPath: '/media',
    writable: false,
  })
}

const changed = computed(
  () =>
    JSON.stringify(volumes.value) !== JSON.stringify(props.project.volumes) ||
    JSON.stringify(libraries.value) !==
      JSON.stringify(
        props.project.libraries.map((l) => ({
          libraryId: l.libraryId,
          mountPath: l.mountPath,
          writable: !l.readOnly,
        })),
      ) ||
    gpu.value !== props.project.gpu,
)
const removedVolumes = computed(() =>
  props.project.volumes.filter((v) => !volumes.value.some((r) => r.name === v.name)),
)

const busy = ref(false)
const error = ref<string | null>(null)
async function save() {
  busy.value = true
  error.value = null
  try {
    const updated = await api('updateProject', {
      params: { id: props.project.id },
      body: {
        volumes: volumes.value.map((v) => ({ name: v.name.trim(), mountPath: v.mountPath.trim() })),
        ...(session.isAdmin
          ? {
              libraries: libraries.value
                .filter((l) => l.libraryId)
                .map((l) => ({
                  libraryId: l.libraryId!,
                  mountPath: l.mountPath.trim(),
                  writable: l.writable,
                })),
              gpu: gpu.value,
            }
          : {}),
      },
    })
    projects.upsert(updated)
    notify.success(toastCopy.saved, 'Storage changes apply on the next deploy.')
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <HgPanel
    id="storage"
    title="Storage"
    description="Folders the app keeps across deploys and updates, and folders from this computer it can read. Changes apply on the next deploy."
  >
    <form class="hg-storage" @submit.prevent="save">
      <section class="hg-storage-group" aria-labelledby="st-kept">
        <h3 id="st-kept"><BaseIcon name="database" :size="16" /> Kept folders</h3>
        <p class="hg-muted">
          Anything the app writes here survives redeploys, updates, and restarts. Everything else in
          the container starts fresh each time.
        </p>
        <div v-for="(row, i) in volumes" :key="i" class="hg-storage-row">
          <BaseInput
            :id="`st-vol-name-${i}`"
            v-model="row.name"
            mono
            aria-label="Name"
            placeholder="data"
          />
          <BaseInput
            :id="`st-vol-path-${i}`"
            v-model="row.mountPath"
            mono
            aria-label="Folder inside the app"
            placeholder="/data"
          />
          <span class="hg-storage-size hg-muted">{{ sizeOf(row.name) ?? '' }}</span>
          <BaseButton
            size="sm"
            variant="ghost"
            icon="trash"
            :aria-label="`Remove ${row.name}`"
            @click="volumes.splice(i, 1)"
          />
        </div>
        <div>
          <BaseButton size="sm" icon="plus" label="Add a kept folder" @click="addVolume" />
        </div>
        <BaseMessage v-if="removedVolumes.length" tone="info">
          Removing {{ removedVolumes.map((v) => v.name).join(', ') }} here keeps its data. An admin
          can delete it for good under Settings → Storage.
        </BaseMessage>
      </section>

      <section
        v-if="session.isAdmin || libraries.length"
        class="hg-storage-group"
        aria-labelledby="st-libraries"
      >
        <h3 id="st-libraries"><BaseIcon name="folder" :size="16" /> Libraries</h3>
        <p class="hg-muted">
          Folders on this computer, like your movies or photos. Read-only unless the library allows
          writing.
        </p>
        <template v-if="session.isAdmin">
          <p v-if="!known.length" class="hg-muted">
            No libraries yet.
            <RouterLink :to="{ name: 'settings', params: { section: 'storage' } }"
              >Add one in Settings</RouterLink
            >
            first.
          </p>
          <div v-for="(row, i) in libraries" :key="i" class="hg-storage-row">
            <BaseSelect
              :id="`st-lib-${i}`"
              v-model="row.libraryId"
              :options="libraryOptions"
              placeholder="Pick a library"
            />
            <BaseInput
              :id="`st-lib-path-${i}`"
              v-model="row.mountPath"
              mono
              aria-label="Folder inside the app"
              placeholder="/media"
            />
            <label v-if="writableAllowed(row.libraryId)" class="hg-storage-write">
              <input v-model="row.writable" type="checkbox" /> Can write
            </label>
            <span v-else class="hg-storage-size hg-muted">Read-only</span>
            <BaseButton
              size="sm"
              variant="ghost"
              icon="trash"
              aria-label="Remove library"
              @click="libraries.splice(i, 1)"
            />
          </div>
          <div v-if="known.length">
            <BaseButton size="sm" icon="plus" label="Add a library" @click="addLibrary" />
          </div>
        </template>
        <ul v-else class="hg-storage-list">
          <li v-for="l in project.libraries" :key="l.mountPath">
            {{ l.name }} at <code>{{ l.mountPath }}</code
            >{{ l.readOnly ? ', read-only' : '' }}
          </li>
        </ul>
      </section>

      <section
        v-if="session.isAdmin && (gpuAvailable || gpu)"
        class="hg-storage-group"
        aria-labelledby="st-gpu"
      >
        <h3 id="st-gpu"><BaseIcon name="monitor" :size="16" /> Graphics chip</h3>
        <div class="hg-storage-switch">
          <BaseSwitch id="st-gpu-switch" v-model="gpu" />
          <label for="st-gpu-switch"
            >Let the app use this computer's graphics chip, for faster video conversion.</label
          >
        </div>
      </section>

      <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
      <div>
        <BaseButton
          type="submit"
          variant="primary"
          label="Save storage"
          :loading="busy"
          :disabled="!changed"
        />
      </div>
    </form>
  </HgPanel>
</template>

<style scoped>
.hg-storage {
  display: grid;
  gap: var(--hg-space-5);
}
.hg-storage-group {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-storage-group h3 {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
  font-size: var(--hg-size-base);
}
.hg-storage-group > p {
  margin: 0;
  font-size: var(--hg-size-sm);
}
.hg-storage-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 6rem auto;
  align-items: center;
  gap: var(--hg-space-2);
}
.hg-storage-size {
  font-size: var(--hg-size-sm);
  text-align: right;
}
.hg-storage-write {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  font-size: var(--hg-size-sm);
}
.hg-storage-switch {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  font-size: var(--hg-size-sm);
}
.hg-storage-list {
  margin: 0;
  padding-left: 1.2rem;
  font-size: var(--hg-size-sm);
}
@media (max-width: 36rem) {
  .hg-storage-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }
  .hg-storage-size,
  .hg-storage-write {
    grid-column: 1 / -1;
    text-align: left;
  }
}
</style>
