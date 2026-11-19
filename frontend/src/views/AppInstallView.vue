<script setup lang="ts">
import {
  appHostname,
  catalogApp,
  checkProjectName,
  isPinnedImage,
  isValidImageRef,
  type LibraryView,
  libraryPathProblemCopy,
  checkLibraryPath,
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  parseWholeNumber,
  type SettingsView,
} from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import EmptyState from '../components/EmptyState.vue'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useProjectsStore } from '../stores/projects.ts'
import {
  BaseButton,
  BaseField,
  BaseIcon,
  BaseInput,
  BaseMessage,
  BaseSelect,
  BaseSwitch,
} from '../ui/index.ts'

// Installing an app (D42): a catalog template with everything chosen, or any image by name. The
// recommended settings are filled in; "Customize" shows the rest.
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()

const id = computed(() => String(route.params.id))
const template = computed(() => catalogApp(id.value))
const custom = computed(() => id.value === 'image')
useDocumentTitle(
  computed(() => (template.value ? `Install ${template.value.name}` : 'Run an image')),
)

const image = ref(template.value?.image ?? '')
const name = ref(template.value?.id ?? '')
const port = ref(template.value ? String(template.value.port) : '')
const memory = ref(String(template.value?.memoryLimitMb ?? 512))
const volumes = ref(
  template.value?.volumes.map((v) => ({ name: v.name, mountPath: v.mountPath })) ?? [],
)
const customize = ref(false)
const publish = ref(false)
const gpu = ref(true)

// A custom image suggests its own name: ghcr.io/owner/my-app:1.2 → my-app.
function onImage() {
  if (!custom.value) return
  const base = image.value.trim().split('@')[0]!.split('/').pop()!.split(':')[0]!
  const suggested = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!nameTouched.value) name.value = suggested.slice(0, 40)
}
const nameTouched = ref(false)

const libraries = ref<LibraryView[]>([])
const libraryId = ref<string | null>(null)
const settings = ref<SettingsView | null>(null)
const gpuAvailable = ref(false)
onMounted(async () => {
  const [libs, info, s] = await Promise.all([
    api('listLibraries').catch(() => [] as LibraryView[]),
    api('systemInfo').catch(() => null),
    api('getSettings').catch(() => null),
    projects.ensureLoaded().catch(() => {}),
  ])
  libraries.value = libs
  libraryId.value = libs[0]?.id ?? null
  // A second Jellyfin gets jellyfin-2, so the recommended install never starts blocked.
  if (projects.byName.has(name.value) && !nameTouched.value) {
    let n = 2
    while (projects.byName.has(`${name.value}-${n}`)) n++
    name.value = `${name.value}-${n}`
  }
  gpuAvailable.value = info?.gpu ?? false
  settings.value = s
})
const libraryOptions = computed(() =>
  libraries.value.map((l) => ({ label: `${l.name} (${l.path})`, value: l.id })),
)

// Adding a library right here, so a first install needs no detour through Settings.
const newLibrary = ref({ name: '', path: '' })
const addingLibrary = ref(false)
const libraryError = ref<string | null>(null)
const libraryBusy = ref(false)
const newPathProblem = computed(() => {
  const path = newLibrary.value.path.trim()
  const problem = path ? checkLibraryPath(path) : null
  return problem ? libraryPathProblemCopy[problem] : null
})
async function addLibrary() {
  libraryBusy.value = true
  libraryError.value = null
  try {
    const created = await api('createLibrary', {
      body: { name: newLibrary.value.name.trim(), path: newLibrary.value.path.trim() },
    })
    libraries.value = [...libraries.value, created]
    libraryId.value = created.id
    addingLibrary.value = false
    newLibrary.value = { name: '', path: '' }
  } catch (e) {
    libraryError.value = messageOf(e)
  } finally {
    libraryBusy.value = false
  }
}

const nameProblem = computed(() => {
  const problem = checkProjectName(name.value.trim())
  if (problem === 'empty') return 'Give the app a name.'
  if (problem === 'reserved') return 'That name is reserved. Pick another.'
  if (problem) return 'Use lowercase letters, digits, and dashes.'
  if (projects.byName.has(name.value.trim()))
    return `There is already an app called ${name.value.trim()}.`
  return null
})
const imageProblem = computed(() =>
  isValidImageRef(image.value.trim())
    ? null
    : 'Enter an image like ghcr.io/owner/app:1.2, lowercase.',
)
const portValue = computed(() =>
  port.value.trim() ? parseWholeNumber(port.value, 1, 65535) : null,
)
const memoryValue = computed(() =>
  parseWholeNumber(memory.value, MEMORY_LIMIT_MIN_MB, MEMORY_LIMIT_MAX_MB),
)
const publicAddress = computed(() =>
  settings.value?.defaultDomain && name.value
    ? appHostname(name.value.trim(), settings.value.defaultDomain)
    : null,
)
const blocked = computed(
  () =>
    Boolean(nameProblem.value || imageProblem.value) ||
    (port.value.trim() !== '' && portValue.value === null) ||
    memoryValue.value === null,
)

const busy = ref(false)
const error = ref<string | null>(null)
async function install() {
  if (blocked.value) return
  busy.value = true
  error.value = null
  const t = template.value
  try {
    const project = await api('createImageApp', {
      body: {
        name: name.value.trim(),
        image: image.value.trim(),
        port: portValue.value,
        memoryLimitMb: memoryValue.value!,
        hostnames: publish.value && publicAddress.value ? [publicAddress.value] : [],
        volumes: volumes.value.map((v) => ({ name: v.name.trim(), mountPath: v.mountPath.trim() })),
        libraries:
          t?.library && libraryId.value
            ? [{ libraryId: libraryId.value, mountPath: t.library.mountPath }]
            : [],
        gpu: Boolean(t?.gpu && gpuAvailable.value && gpu.value),
        env: t?.env,
        catalogId: t?.id,
        deploy: true,
      },
    })
    projects.upsert(project)
    await router.push(
      project.latest
        ? { name: 'deployment', params: { id: project.latest.id } }
        : { name: 'project', params: { name: project.name } },
    )
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <EmptyState
    v-if="!template && !custom"
    title="That app is not in the catalog."
    body="It may have been renamed. Pick one from the list."
  >
    <RouterLink v-slot="{ navigate }" :to="{ name: 'apps' }" custom>
      <BaseButton variant="primary" label="Back to apps" @click="navigate" />
    </RouterLink>
  </EmptyState>

  <form v-else class="hg-install" @submit.prevent="install">
    <PageHeader
      :title="template ? `Install ${template.name}` : 'Run an image'"
      :subtitle="
        template?.summary ?? 'Any published Docker image, with storage that survives updates.'
      "
    />

    <HgPanel v-if="template">
      <p class="hg-install-about">{{ template.description }}</p>
      <a :href="template.website" target="_blank" rel="noopener" class="hg-install-site">
        {{ template.website.replace(/^https:\/\//, '') }} <BaseIcon name="external" :size="14" />
      </a>
    </HgPanel>

    <HgPanel v-if="custom" title="Image">
      <BaseField
        label="Image"
        for="ai-image"
        :error="image && imageProblem ? imageProblem : null"
        :help="
          image && !imageProblem && !isPinnedImage(image.trim())
            ? 'No version given: each update takes whatever is newest. Pin one, like :1.2.'
            : 'From Docker Hub, GitHub (ghcr.io), or any registry, as you would pass it to docker pull.'
        "
      >
        <BaseInput
          id="ai-image"
          v-model="image"
          mono
          placeholder="ghcr.io/owner/app:1.2"
          @update:model-value="onImage"
        />
      </BaseField>
    </HgPanel>

    <HgPanel v-if="template?.library" :title="template.library.label">
      <div class="hg-install-group">
        <p class="hg-muted">{{ template.library.hint }}</p>
        <BaseField v-if="libraries.length" label="Library" for="ai-library">
          <BaseSelect id="ai-library" v-model="libraryId" :options="libraryOptions" />
        </BaseField>
        <p v-else-if="!addingLibrary" class="hg-muted">
          No libraries yet. A library is a folder on this computer, like /srv/media/movies.
        </p>
        <div v-if="addingLibrary || !libraries.length" class="hg-install-library">
          <BaseField label="Name" for="ai-lib-name">
            <BaseInput id="ai-lib-name" v-model="newLibrary.name" placeholder="Movies" />
          </BaseField>
          <BaseField label="Folder on this computer" for="ai-lib-path" :error="newPathProblem">
            <BaseInput
              id="ai-lib-path"
              v-model="newLibrary.path"
              mono
              placeholder="/srv/media/movies"
            />
          </BaseField>
          <BaseMessage v-if="libraryError" tone="error">{{ libraryError }}</BaseMessage>
          <div>
            <BaseButton
              icon="folder"
              label="Add library"
              :loading="libraryBusy"
              :disabled="!newLibrary.name.trim() || !newLibrary.path.trim() || !!newPathProblem"
              @click="addLibrary"
            />
          </div>
        </div>
        <div v-else>
          <BaseButton
            size="sm"
            variant="ghost"
            icon="plus"
            label="Add another library"
            @click="addingLibrary = true"
          />
        </div>
      </div>
    </HgPanel>

    <HgPanel v-if="template?.gpu && gpuAvailable" title="Graphics chip">
      <div class="hg-install-switch">
        <BaseSwitch id="ai-gpu" v-model="gpu" />
        <label for="ai-gpu">{{ template.gpu.hint }}</label>
      </div>
    </HgPanel>

    <HgPanel title="Where it answers">
      <div class="hg-install-group">
        <p class="hg-muted">
          On your devices with Tailscale, at
          <code v-if="settings?.lanDomain && name"
            >http://{{ name.trim() }}.{{ settings.lanDomain }}</code
          ><span v-else>its own address</span>. Nobody else can reach it.
        </p>
        <div v-if="publicAddress" class="hg-install-switch">
          <BaseSwitch id="ai-public" v-model="publish" />
          <label for="ai-public"
            >Also put it on the internet at <code>{{ publicAddress }}</code></label
          >
        </div>
      </div>
    </HgPanel>

    <details
      class="hg-install-more"
      :open="customize || custom"
      @toggle="customize = ($event.target as HTMLDetailsElement).open"
    >
      <summary>Customize</summary>
      <div class="hg-install-grid">
        <BaseField label="App name" for="ai-name" :error="nameProblem" help="Used in its address.">
          <BaseInput id="ai-name" v-model="name" mono @update:model-value="nameTouched = true" />
        </BaseField>
        <BaseField v-if="template" label="Image" for="ai-image-t" :error="imageProblem">
          <BaseInput id="ai-image-t" v-model="image" mono />
        </BaseField>
        <BaseField label="Web port" for="ai-port" help="Leave empty to read it from the image.">
          <BaseInput id="ai-port" v-model="port" mono inputmode="numeric" placeholder="auto" />
        </BaseField>
        <BaseField label="Memory limit (MB)" for="ai-memory">
          <BaseInput id="ai-memory" v-model="memory" mono inputmode="numeric" />
        </BaseField>
        <div class="hg-install-wide">
          <span class="hg-install-label">Kept folders</span>
          <p class="hg-muted hg-install-small">
            Folders inside the app that survive updates. Add the ones the image's documentation
            calls volumes, like /config or /data.
          </p>
          <div v-for="(v, i) in volumes" :key="i" class="hg-install-row">
            <BaseInput :id="`ai-vol-${i}`" v-model="v.name" mono aria-label="Name" />
            <BaseInput
              :id="`ai-vol-path-${i}`"
              v-model="v.mountPath"
              mono
              aria-label="Folder inside the app"
            />
            <BaseButton
              size="sm"
              variant="ghost"
              icon="trash"
              aria-label="Remove"
              @click="volumes.splice(i, 1)"
            />
          </div>
          <BaseButton
            size="sm"
            icon="plus"
            label="Add a kept folder"
            @click="
              volumes.push({
                name: volumes.length ? `data-${volumes.length + 1}` : 'data',
                mountPath: '/data',
              })
            "
          />
        </div>
      </div>
    </details>

    <BaseMessage v-if="nameProblem && !customize" tone="error">
      {{ nameProblem }} Change it under Customize.
    </BaseMessage>
    <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
    <div class="hg-install-actions">
      <BaseButton
        type="submit"
        variant="primary"
        icon="download"
        :label="template ? `Install ${template.name}` : 'Run it'"
        :loading="busy"
        :disabled="blocked"
      />
      <RouterLink v-slot="{ navigate }" :to="{ name: 'apps' }" custom>
        <BaseButton variant="ghost" label="Cancel" @click="navigate" />
      </RouterLink>
    </div>
  </form>
</template>

<style scoped>
.hg-install {
  display: grid;
  gap: var(--hg-space-5);
  max-width: 46rem;
}
.hg-install-about {
  margin: 0 0 var(--hg-space-3);
  line-height: 1.6;
}
.hg-install-site {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  font-size: var(--hg-size-sm);
}
.hg-install-group {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-install-group > p {
  margin: 0;
  font-size: var(--hg-size-sm);
}
.hg-install-library {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: var(--hg-space-3);
  align-items: start;
}
.hg-install-library > :nth-child(n + 3) {
  grid-column: 1 / -1;
}
.hg-install-switch {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  font-size: var(--hg-size-sm);
}
.hg-install-more {
  border: 1px solid var(--hg-line);
  padding: var(--hg-space-4) var(--hg-space-5);
}
.hg-install-more summary {
  cursor: pointer;
  font-weight: var(--hg-weight-bold);
}
.hg-install-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--hg-space-4);
  margin-top: var(--hg-space-4);
}
.hg-install-wide {
  grid-column: 1 / -1;
  display: grid;
  gap: var(--hg-space-2);
  justify-items: start;
}
.hg-install-label {
  font-size: var(--hg-size-sm);
}
.hg-install-small {
  margin: 0;
  font-size: var(--hg-size-sm);
}
.hg-install-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto;
  gap: var(--hg-space-2);
  width: 100%;
}
.hg-install-actions {
  display: flex;
  gap: var(--hg-space-3);
}
@media (max-width: 36rem) {
  .hg-install-grid,
  .hg-install-library {
    grid-template-columns: 1fr;
  }
}
</style>
