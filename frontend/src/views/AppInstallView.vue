<script setup lang="ts">
import {
  appHostname,
  catalogApp,
  checkProjectName,
  isPinnedImage,
  isValidImageRef,
  type DeviceView,
  type LibraryView,
  libraryPathProblemCopy,
  checkLibraryPath,
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  parseWholeNumber,
  checkHostPort,
  hostPortProblemCopy,
  portLabel,
  type PortProtocol,
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
import { useSessionStore } from '../stores/session.ts'
import {
  BaseButton,
  BaseField,
  BaseIcon,
  BaseInput,
  BaseMessage,
  BaseSelect,
  BaseSwitch,
} from '../ui/index.ts'

// Installing an app (D42, D43): a catalog template with everything chosen, or any image by name.
// The recommended settings are filled in; "Customize" shows the rest. Members install standard
// templates as written; admins may also change a template's image, port, and storage.
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const session = useSessionStore()

const id = computed(() => String(route.params.id))
const template = computed(() => catalogApp(id.value))
const custom = computed(() => id.value === 'image')
/** Why this account cannot install it, if it cannot (the server checks the same). */
const lockedReason = computed(() => {
  if (session.isAdmin) return null
  if (custom.value) return 'Only an admin can run any image. Pick an app from the list instead.'
  if (template.value && template.value.tier !== 'standard') {
    const what = template.value.device
      ? 'uses a USB stick plugged into this computer'
      : template.value.ports?.length
        ? 'uses a port on this computer'
        : 'reads a folder on this computer'
    return `${template.value.name} ${what}, so an admin installs it. Ask an admin to install it for you.`
  }
  return null
})
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
/** Required answers (D52), such as a licence: the `env` of each accepted question. */
const accepted = ref<Record<string, boolean>>({})
const questions = computed(() => template.value?.questions ?? [])
const unanswered = computed(() => questions.value.some((q) => !accepted.value[q.env]))
/** Where ports are published (D51): the machine's Tailscale name, or its address. */
const portHost = computed(() => {
  const url = settings.value?.privateUrl
  return url ? new URL(url).hostname : (settings.value?.lanIp ?? null)
})
/** Any image (admins): a web page unless said otherwise, and ports of its own (D51). */
const webPage = ref(true)
const ownPorts = ref<{ port: string; protocol: PortProtocol }[]>([])
const isWeb = computed(() => (template.value ? template.value.web !== false : webPage.value))
const parsedPorts = computed(() =>
  ownPorts.value.map((p) => ({ port: parseWholeNumber(p.port, 1, 65535), protocol: p.protocol })),
)
/** The ports shown under "Where it answers": the template's, or the admin's own. */
const shownPorts = computed(() =>
  template.value
    ? (template.value.ports ?? [])
    : parsedPorts.value
        .filter((p) => p.port !== null)
        .map((p) => ({ port: p.port!, protocol: p.protocol, purpose: 'Connect here' })),
)
const portsProblem = computed(() => {
  for (const p of parsedPorts.value) {
    if (p.port === null) return hostPortProblemCopy.invalid
    const problem = checkHostPort(p.port)
    if (problem) return hostPortProblemCopy[problem]
  }
  return null
})
const gpu = ref(true)
/** The computer's own network (D54): off unless an admin turns it on. */
const hostNetwork = ref(false)

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
/** USB sticks plugged in (D55), for a template that needs one. */
const devices = ref<DeviceView[] | null>(null)
const device = ref<string | null>(null)
const deviceOptions = computed(() =>
  (devices.value ?? []).map((d) => ({
    label: d.usedBy.length ? `${d.name} (used by ${d.usedBy.join(', ')})` : d.name,
    value: d.path,
  })),
)
async function loadDevices() {
  devices.value = await api('listDevices').catch(() => [])
  device.value = devices.value.find((d) => !d.usedBy.length)?.path ?? devices.value[0]?.path ?? null
}
onMounted(async () => {
  if (template.value?.device && session.isAdmin) void loadDevices()
  const [libs, info, s] = await Promise.all([
    session.isAdmin ? api('listLibraries').catch(() => [] as LibraryView[]) : [],
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
    Boolean(nameProblem.value || imageProblem.value || unanswered.value || portsProblem.value) ||
    Boolean(template.value?.device && !device.value) ||
    (port.value.trim() !== '' && portValue.value === null) ||
    memoryValue.value === null,
)

/** A stack's parts (D44) and the most memory they may use together, for the install page. */
const parts = computed(() => template.value?.services ?? [])
const stackMemoryGb = computed(() => {
  const t = template.value
  if (!t || !parts.value.length) return null
  const mb =
    (memoryValue.value ?? t.memoryLimitMb) + parts.value.reduce((n, p) => n + p.memoryLimitMb, 0)
  return Math.round((mb / 1024) * 10) / 10
})

/** Whether this is the template as written: then the server installs it from its own copy. */
const asWritten = computed(() => {
  const t = template.value
  if (!t) return false
  return (
    image.value.trim() === t.image &&
    portValue.value === t.port &&
    JSON.stringify(volumes.value.map((v) => [v.name.trim(), v.mountPath.trim()])) ===
      JSON.stringify(t.volumes.map((v) => [v.name, v.mountPath]))
  )
})
/** Apps whose first visitor becomes admin stay private until their owner has set them up. */
const offerPublic = computed(() =>
  Boolean(publicAddress.value && isWeb.value && !template.value?.firstVisitorIsAdmin),
)

const busy = ref(false)
const error = ref<string | null>(null)
async function install() {
  if (blocked.value) return
  busy.value = true
  error.value = null
  const t = template.value
  const hostnames =
    offerPublic.value && publish.value && publicAddress.value ? [publicAddress.value] : []
  const libraryChoice = t?.library && libraryId.value ? libraryId.value : undefined
  const useGpu = Boolean(t?.gpu && gpuAvailable.value && gpu.value)
  try {
    const project =
      t && asWritten.value
        ? await api('installCatalogApp', {
            params: { id: t.id },
            body: {
              name: name.value.trim(),
              memoryLimitMb: memoryValue.value!,
              hostnames,
              ...(libraryChoice ? { libraryId: libraryChoice } : {}),
              gpu: useGpu,
              ...(t.hostNetwork && hostNetwork.value ? { hostNetwork: true } : {}),
              ...(t.device && device.value ? { device: device.value } : {}),
              accepted: questions.value.filter((q) => accepted.value[q.env]).map((q) => q.env),
              deploy: true,
            },
          })
        : await api('createImageApp', {
            body: {
              name: name.value.trim(),
              image: image.value.trim(),
              port: portValue.value,
              memoryLimitMb: memoryValue.value!,
              ...(t?.buildTimeoutMinutes ? { buildTimeoutMinutes: t.buildTimeoutMinutes } : {}),
              hostnames,
              volumes: volumes.value.map((v) => ({
                name: v.name.trim(),
                mountPath: v.mountPath.trim(),
              })),
              libraries:
                t?.library && libraryChoice
                  ? [{ libraryId: libraryChoice, mountPath: t.library.mountPath }]
                  : [],
              gpu: useGpu,
              ...(t?.hostNetwork && hostNetwork.value ? { hostNetwork: true } : {}),
              ...(t?.device && device.value ? { device: device.value } : {}),
              ...(t
                ? {}
                : {
                    web: isWeb.value,
                    ports: parsedPorts.value.map((p) => ({ port: p.port!, protocol: p.protocol })),
                  }),
              env: t
                ? {
                    ...t.env,
                    ...Object.fromEntries(
                      questions.value
                        .filter((q) => accepted.value[q.env])
                        .map((q) => [q.env, q.value]),
                    ),
                  }
                : undefined,
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

  <EmptyState v-else-if="lockedReason" title="Ask an admin" :body="lockedReason">
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
      <p v-if="parts.length" class="hg-install-parts hg-muted">
        Runs as {{ parts.length + 1 }} parts that Hangar starts, updates, and stops together:
        {{ template.name }}, {{ parts.map((p) => p.name).join(', ') }}. Together they may use up to
        {{ stackMemoryGb }} GB of memory. Only {{ template.name }} gets an address; the other parts
        are private to it.
      </p>
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

    <HgPanel v-if="template?.device" :title="template.device.label">
      <div class="hg-install-group">
        <p class="hg-muted">{{ template.device.hint }}</p>
        <BaseField
          v-if="devices?.length"
          label="Device"
          for="ai-device"
          help="Its name stays the same when you plug it into another USB socket."
        >
          <BaseSelect id="ai-device" v-model="device" :options="deviceOptions" />
        </BaseField>
        <BaseMessage v-else-if="devices" tone="warn">
          No USB stick is plugged in. Plug it into the computer, then look again.
        </BaseMessage>
        <div>
          <BaseButton size="sm" icon="restart" label="Look again" @click="loadDevices" />
        </div>
      </div>
    </HgPanel>

    <HgPanel v-if="template?.hostNetwork && session.isAdmin" title="Home network">
      <div class="hg-install-switch">
        <BaseSwitch id="ai-host-network" v-model="hostNetwork" />
        <label for="ai-host-network">{{ template.hostNetwork.hint }}</label>
      </div>
      <BaseMessage v-if="hostNetwork" tone="warn">
        Anyone on your home network can then reach {{ template.name }}'s sign-in page at this
        computer's address. Its private address over Tailscale stays the same.
      </BaseMessage>
    </HgPanel>

    <HgPanel v-if="template?.gpu && gpuAvailable" title="Graphics chip">
      <div class="hg-install-switch">
        <BaseSwitch id="ai-gpu" v-model="gpu" />
        <label for="ai-gpu">{{ template.gpu.hint }}</label>
      </div>
    </HgPanel>

    <HgPanel v-if="questions.length" title="Before installing">
      <div class="hg-install-group">
        <div v-for="q in questions" :key="q.env" class="hg-install-question">
          <div class="hg-install-switch">
            <BaseSwitch :id="`ai-q-${q.env}`" v-model="accepted[q.env]" />
            <label :for="`ai-q-${q.env}`">{{ q.label }}</label>
          </div>
          <p class="hg-muted hg-install-small">
            {{ q.hint }}
            <a v-if="q.link" :href="q.link" target="_blank" rel="noopener"
              >Read it <BaseIcon name="external" :size="12"
            /></a>
          </p>
        </div>
      </div>
    </HgPanel>

    <HgPanel v-if="!isWeb" title="Where it answers">
      <div class="hg-install-group">
        <p v-if="!shownPorts.length" class="hg-muted">
          {{ template?.name }} is not a web page. Your other apps reach it at
          <code>{{ name.trim() || template?.id }}:{{ template?.port }}</code
          >, its name and port; nothing else can, not even your own devices.
        </p>
        <p v-else class="hg-muted">
          {{ template?.name }} is not a web page. On your devices with Tailscale, connect to
          <template v-for="(p, i) in shownPorts" :key="p.port"
            ><template v-if="i > 0">, </template
            ><code
              >{{ portHost ?? 'this computer' }}:{{
                portLabel({ hostPort: p.port, protocol: p.protocol })
              }}</code
            >
            ({{ p.purpose.toLowerCase() }})</template
          >. Nobody else can reach it, and it is never put on the internet.
        </p>
      </div>
    </HgPanel>

    <HgPanel v-else title="Where it answers">
      <div class="hg-install-group">
        <p class="hg-muted">
          On your devices with Tailscale, at
          <code v-if="settings?.lanDomain && name"
            >http://{{ name.trim() }}.{{ settings.lanDomain }}</code
          ><span v-else>its own address</span>. Nobody else can reach it.
        </p>
        <p v-if="publicAddress && !offerPublic" class="hg-muted">
          Whoever opens {{ template?.name }} first becomes its admin, so finish its setup before
          putting it on the internet. Then add a public address under its Settings.
        </p>
        <div v-if="offerPublic" class="hg-install-switch">
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
        <BaseField
          v-if="template && session.isAdmin"
          label="Image"
          for="ai-image-t"
          :error="imageProblem"
        >
          <BaseInput id="ai-image-t" v-model="image" mono />
        </BaseField>
        <BaseField
          v-if="session.isAdmin && isWeb"
          label="Web port"
          for="ai-port"
          help="Leave empty to read it from the image."
        >
          <BaseInput id="ai-port" v-model="port" mono inputmode="numeric" placeholder="auto" />
        </BaseField>
        <BaseField label="Memory limit (MB)" for="ai-memory">
          <BaseInput id="ai-memory" v-model="memory" mono inputmode="numeric" />
        </BaseField>
        <div v-if="!session.isAdmin && template" class="hg-install-wide">
          <span class="hg-install-label">Kept folders</span>
          <ul class="hg-install-kept">
            <li v-for="v in template.volumes" :key="v.name">
              <code>{{ v.mountPath }}</code> {{ v.purpose }}
            </li>
          </ul>
        </div>
        <div v-else class="hg-install-wide">
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
        <div v-if="custom && session.isAdmin" class="hg-install-wide">
          <span class="hg-install-label">Not a web page</span>
          <div class="hg-install-switch">
            <BaseSwitch
              id="ai-web"
              :model-value="!webPage"
              @update:model-value="webPage = !$event"
            />
            <label for="ai-web"
              >It is something else, like a game server: no address in the browser, and Hangar
              checks it by connecting to its port.</label
            >
          </div>
          <span class="hg-install-label">Ports on this computer</span>
          <p class="hg-muted hg-install-small">
            Published on this computer's Tailscale address only, at the same number. Your devices,
            and people you share the computer with in Tailscale, can connect.
          </p>
          <div v-for="(p, i) in ownPorts" :key="i" class="hg-install-row">
            <BaseInput
              :id="`ai-port-${i}`"
              v-model="p.port"
              mono
              inputmode="numeric"
              aria-label="Port"
            />
            <BaseSelect
              :id="`ai-port-proto-${i}`"
              v-model="p.protocol"
              :options="[
                { label: 'TCP', value: 'tcp' },
                { label: 'UDP', value: 'udp' },
              ]"
              aria-label="Protocol"
            />
            <BaseButton
              size="sm"
              variant="ghost"
              icon="trash"
              aria-label="Remove"
              @click="ownPorts.splice(i, 1)"
            />
          </div>
          <BaseMessage v-if="portsProblem" tone="error">{{ portsProblem }}</BaseMessage>
          <BaseButton
            size="sm"
            icon="plus"
            label="Add a port"
            @click="ownPorts.push({ port: '', protocol: 'tcp' })"
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
.hg-install-question .hg-install-small {
  margin: var(--hg-space-1) 0 0;
}
.hg-install-parts {
  margin: var(--hg-space-3) 0 0;
  font-size: var(--hg-size-sm);
  line-height: 1.6;
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
.hg-install-kept {
  margin: 0;
  padding-left: var(--hg-space-5);
  font-size: var(--hg-size-sm);
  line-height: 1.7;
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
