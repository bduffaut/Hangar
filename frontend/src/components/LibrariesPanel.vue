<script setup lang="ts">
import {
  checkLibraryPath,
  type LibraryView,
  libraryPathProblemCopy,
  type schemas,
} from '@hangar/shared'
import type { z } from 'zod'
import { computed, onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import { formatBytes } from '../lib/format.ts'
import {
  BaseButton,
  BaseField,
  BaseIcon,
  BaseInput,
  BaseMessage,
  useConfirmAction,
  useNotify,
} from '../ui/index.ts'
import HgPanel from './HgPanel.vue'

// Settings → Storage (admins): the folders apps may use, and the data apps keep (D42).
type Volume = z.infer<typeof schemas.volumeListView>[number]
const notify = useNotify()
const confirm = useConfirmAction()

const libraries = ref<LibraryView[]>([])
const volumes = ref<Volume[]>([])
const loaded = ref(false)
async function load() {
  ;[libraries.value, volumes.value] = await Promise.all([
    api('listLibraries').catch(() => []),
    api('listVolumes').catch(() => []),
  ])
  loaded.value = true
}
onMounted(load)

const name = ref('')
const path = ref('')
const writable = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const pathProblem = computed(() => {
  const problem = path.value.trim() ? checkLibraryPath(path.value.trim()) : null
  return problem ? libraryPathProblemCopy[problem] : null
})
async function add() {
  busy.value = true
  error.value = null
  try {
    const created = await api('createLibrary', {
      body: { name: name.value.trim(), path: path.value.trim(), writable: writable.value },
    })
    libraries.value = [...libraries.value, created].sort((a, b) => a.name.localeCompare(b.name))
    name.value = ''
    path.value = ''
    writable.value = false
    notify.success(`${created.name} added`, 'Apps can use it now.')
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}

async function toggleWrite(library: LibraryView) {
  try {
    const updated = await api('updateLibrary', {
      params: { id: library.id },
      body: { writable: !library.writable },
    })
    libraries.value = libraries.value.map((l) => (l.id === updated.id ? updated : l))
  } catch (e) {
    notify.error(messageOf(e))
  }
}

async function removeLibrary(library: LibraryView) {
  const ok = await confirm({
    title: `Remove ${library.name}?`,
    body: `Apps can no longer be given ${library.path}. The folder and its files stay exactly as they are.`,
    action: 'Remove library',
    danger: true,
  })
  if (!ok) return
  try {
    await api('deleteLibrary', { params: { id: library.id } })
    libraries.value = libraries.value.filter((l) => l.id !== library.id)
  } catch (e) {
    notify.error(messageOf(e))
  }
}

function describe(volume: Volume): string {
  const owner = volume.orphaned
    ? `Left by ${volume.app ?? 'a deleted app'}`
    : `Used by ${volume.app ?? 'an app'}`
  return volume.sizeBytes === null ? owner : `${owner}, ${formatBytes(volume.sizeBytes)}`
}

async function removeVolume(volume: Volume) {
  const ok = await confirm({
    title: 'Delete this data for good?',
    body: `${volume.dockerName}${volume.sizeBytes ? ` (${formatBytes(volume.sizeBytes)})` : ''} was kept when ${volume.app ?? 'its app'} was deleted. Deleting it cannot be undone.`,
    action: 'Delete data',
    danger: true,
  })
  if (!ok) return
  try {
    await api('deleteVolume', { params: { name: volume.dockerName } })
    volumes.value = volumes.value.filter((v) => v.dockerName !== volume.dockerName)
  } catch (e) {
    notify.error(messageOf(e))
  }
}
</script>

<template>
  <HgPanel
    id="libraries"
    title="Libraries"
    description="Folders on this computer that apps may use, like your movies or photos. Apps get them read-only unless you allow writing."
  >
    <div class="hg-libs">
      <ul v-if="libraries.length" class="hg-libs-list">
        <li v-for="library in libraries" :key="library.id">
          <BaseIcon name="folder" :size="18" />
          <div class="hg-libs-text">
            <strong>{{ library.name }}</strong>
            <code>{{ library.path }}</code>
            <span class="hg-muted">
              {{ library.usedBy.length ? `Used by ${library.usedBy.join(', ')}` : 'Not used yet' }}
            </span>
          </div>
          <BaseButton
            size="sm"
            variant="ghost"
            :label="library.writable ? 'Apps can write' : 'Read-only'"
            :icon="library.writable ? 'alert' : 'check'"
            @click="toggleWrite(library)"
          />
          <BaseButton
            size="sm"
            variant="ghost"
            icon="trash"
            :aria-label="`Remove ${library.name}`"
            @click="removeLibrary(library)"
          />
        </li>
      </ul>
      <p v-else-if="loaded" class="hg-muted">
        No libraries yet. Add the folder that holds your files, then pick it when you install an app
        like Jellyfin.
      </p>

      <form class="hg-libs-add" @submit.prevent="add">
        <BaseField label="Name" for="lib-name">
          <BaseInput id="lib-name" v-model="name" placeholder="Movies" />
        </BaseField>
        <BaseField
          label="Folder on this computer"
          for="lib-path"
          :error="pathProblem"
          help="Its full path. An external drive is usually under /media or /mnt."
        >
          <BaseInput id="lib-path" v-model="path" mono placeholder="/srv/media/movies" />
        </BaseField>
        <label class="hg-libs-write">
          <input v-model="writable" type="checkbox" />
          Apps may write here (for photo backup or downloads). Leave off for libraries apps only
          read.
        </label>
        <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
        <div>
          <BaseButton
            type="submit"
            icon="plus"
            label="Add library"
            :loading="busy"
            :disabled="!name.trim() || !path.trim() || !!pathProblem"
          />
        </div>
      </form>
    </div>
  </HgPanel>

  <HgPanel
    title="Kept data"
    description="The folders apps keep across updates. Data of a deleted app stays here until you delete it, so reinstalling the app picks it up."
  >
    <ul v-if="volumes.length" class="hg-libs-list">
      <li v-for="volume in volumes" :key="volume.dockerName">
        <BaseIcon name="database" :size="18" />
        <div class="hg-libs-text">
          <code>{{ volume.dockerName }}</code>
          <span class="hg-muted">{{ describe(volume) }}</span>
        </div>
        <BaseButton
          v-if="volume.orphaned"
          size="sm"
          variant="danger"
          icon="trash"
          label="Delete"
          @click="removeVolume(volume)"
        />
      </li>
    </ul>
    <p v-else-if="loaded" class="hg-muted">No app keeps any data yet.</p>
  </HgPanel>
</template>

<style scoped>
.hg-libs {
  display: grid;
  gap: var(--hg-space-5);
}
.hg-libs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.hg-libs-list li {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  padding: var(--hg-space-3) 0;
  border-bottom: 1px solid var(--hg-line);
}
.hg-libs-list li:last-child {
  border-bottom: 0;
}
.hg-libs-text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
  font-size: var(--hg-size-sm);
  overflow-wrap: anywhere;
}
.hg-libs-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: var(--hg-space-4);
  align-items: start;
  padding-top: var(--hg-space-4);
  border-top: 1px solid var(--hg-line);
}
.hg-libs-add > :nth-child(n + 3) {
  grid-column: 1 / -1;
}
.hg-libs-write {
  display: flex;
  gap: var(--hg-space-2);
  align-items: flex-start;
  font-size: var(--hg-size-sm);
}
@media (max-width: 36rem) {
  .hg-libs-add {
    grid-template-columns: 1fr;
  }
}
</style>
