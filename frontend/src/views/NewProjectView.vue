<script setup lang="ts">
import {
  appHostname,
  errorCopy,
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  navCopy,
  parseWholeNumber,
  type TriggerMode,
  triggerModeCopy,
} from '@hangar/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useProjectsStore } from '../stores/projects.ts'
import {
  BaseButton,
  BaseField,
  BaseInput,
  BaseMessage,
  BaseSelect,
  type SelectOption,
} from '../ui/index.ts'

useDocumentTitle(navCopy.newProject)
const router = useRouter()
const projects = useProjectsStore()

interface Repo {
  fullName: string
  url: string
  private: boolean
  defaultBranch: string
}

const settings = ref<{
  lanDomain: string | null
  githubConnected: boolean
  publicDomain: string | null
} | null>(null)
const repos = ref<Repo[]>([])
const branches = ref<string[]>([])
const loadingRepos = ref(false)

const repoUrl = ref('')
const selectedRepo = ref<string | null>(null)
const name = ref('')
const nameTouched = ref(false)
const branch = ref('')
const rootDir = ref('')
const port = ref('')
const memory = ref('512')
const portValue = computed(() =>
  port.value.trim() ? parseWholeNumber(port.value, 1, 65535) : null,
)
const portError = computed(() =>
  port.value.trim() && portValue.value === null ? errorCopy.port : null,
)
const memoryValue = computed(() =>
  parseWholeNumber(memory.value, MEMORY_LIMIT_MIN_MB, MEMORY_LIMIT_MAX_MB),
)
const memoryError = computed(() => (memoryValue.value === null ? errorCopy.memory : null))
const triggerMode = ref<TriggerMode>('poll')
const advanced = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  settings.value = await api('getSettings')
  triggerMode.value = settings.value.publicDomain ? 'webhook' : 'poll'
  if (settings.value.githubConnected) {
    loadingRepos.value = true
    repos.value = await api('githubRepos').catch(() => [])
    loadingRepos.value = false
  }
})

const repoOptions = computed<SelectOption<string>[]>(() =>
  repos.value.map((r) => ({
    label: r.fullName,
    value: r.fullName,
    hint: r.private ? 'Private' : 'Public',
  })),
)

// Picking a repository fills in its address, default branch, and a project name.
watch(selectedRepo, async (fullName) => {
  const repo = repos.value.find((r) => r.fullName === fullName)
  if (!repo) return
  repoUrl.value = repo.url
  branch.value = repo.defaultBranch
  branches.value = await api('githubBranches', { query: { repo: repo.fullName } }).catch(() => [])
})

// Suggest a name from the repository until the person edits it themselves.
watch(repoUrl, (url) => {
  if (nameTouched.value) return
  const last =
    url
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean)
      .at(-1) ?? ''
  name.value = last
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
})

const address = computed(() =>
  settings.value?.lanDomain && name.value
    ? `http://${appHostname(name.value, settings.value.lanDomain)}`
    : null,
)
const branchOptions = computed<SelectOption<string>[]>(() =>
  branches.value.map((b) => ({ label: b, value: b })),
)
const triggerOptions = computed<SelectOption<TriggerMode>[]>(() =>
  (Object.keys(triggerModeCopy) as TriggerMode[]).map((mode) => ({
    label: triggerModeCopy[mode].label,
    value: mode,
    hint: triggerModeCopy[mode].meaning,
  })),
)

async function create() {
  if (portError.value || memoryError.value) return
  busy.value = true
  error.value = null
  try {
    const project = await api('createProject', {
      body: {
        name: name.value,
        repoUrl: repoUrl.value.trim(),
        branch: branch.value.trim() || undefined,
        rootDir: rootDir.value.trim() || undefined,
        port: portValue.value,
        memoryLimitMb: memoryValue.value!,
        triggerMode: triggerMode.value,
      },
    })
    projects.upsert(project)
    if (project.latest) await router.push({ name: 'deployment', params: { id: project.latest.id } })
    else await router.push({ name: 'project', params: { name: project.name } })
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageHeader
    :title="navCopy.newProject"
    subtitle="Connect a repository. Hangar builds the latest commit and gives it its own address."
  />

  <form class="hg-new" @submit.prevent="create">
    <HgPanel title="Repository">
      <div class="hg-new-fields">
        <BaseField
          v-if="settings?.githubConnected"
          label="Pick from GitHub"
          for="new-repo-pick"
          help="Or paste any repository address below."
        >
          <BaseSelect
            id="new-repo-pick"
            v-model="selectedRepo"
            :options="repoOptions"
            :loading="loadingRepos"
            filter
            placeholder="Search your repositories"
          />
        </BaseField>
        <BaseField
          label="Repository address"
          for="new-repo"
          help="The HTTPS address, like https://github.com/you/app."
        >
          <BaseInput
            id="new-repo"
            v-model="repoUrl"
            type="url"
            placeholder="https://github.com/you/app"
            mono
          />
        </BaseField>
        <BaseField
          label="Branch"
          for="new-branch"
          help="Leave empty to use the repository's default branch."
        >
          <BaseSelect
            v-if="branchOptions.length"
            id="new-branch"
            v-model="branch"
            :options="branchOptions"
            filter
          />
          <BaseInput v-else id="new-branch" v-model="branch" placeholder="main" mono />
        </BaseField>
      </div>
    </HgPanel>

    <HgPanel title="Name and address">
      <div class="hg-new-fields">
        <BaseField
          label="Project name"
          for="new-name"
          help="Lowercase letters, digits, and dashes. It becomes the app's address."
        >
          <BaseInput id="new-name" v-model="name" mono @input="nameTouched = true" />
        </BaseField>
        <p v-if="address" class="hg-new-address">
          Your app will be at <code>{{ address }}</code>
        </p>
      </div>
    </HgPanel>

    <HgPanel title="Build and run" description="Most apps work with the defaults.">
      <template #actions>
        <BaseButton
          size="sm"
          variant="ghost"
          :label="advanced ? 'Hide options' : 'Show options'"
          @click="advanced = !advanced"
        />
      </template>
      <div v-if="advanced" class="hg-new-fields hg-new-grid">
        <BaseField
          label="Root directory"
          for="new-root"
          help="For a monorepo: the folder holding the app, like apps/web."
        >
          <BaseInput id="new-root" v-model="rootDir" placeholder="(repository root)" mono />
        </BaseField>
        <BaseField
          label="Port"
          for="new-port"
          :error="portError"
          help="Leave empty to detect it, falling back to 3000."
        >
          <BaseInput
            id="new-port"
            v-model="port"
            :invalid="!!portError"
            inputmode="numeric"
            placeholder="auto"
            mono
          />
        </BaseField>
        <BaseField label="Memory limit (MB)" for="new-memory" :error="memoryError">
          <BaseInput
            id="new-memory"
            v-model="memory"
            :invalid="!!memoryError"
            inputmode="numeric"
            mono
          />
        </BaseField>
        <BaseField
          label="New commits"
          for="new-trigger"
          :help="triggerModeCopy[triggerMode].meaning"
        >
          <BaseSelect id="new-trigger" v-model="triggerMode" :options="triggerOptions" />
        </BaseField>
      </div>
      <p v-else class="hg-muted">
        Root directory: repository root. Port: detected. Memory: {{ memory }} MB. New commits:
        {{ triggerModeCopy[triggerMode].label.toLowerCase() }}.
      </p>
    </HgPanel>

    <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
    <div class="hg-new-actions">
      <BaseButton
        type="submit"
        variant="primary"
        icon="rocket"
        label="Create and deploy"
        :loading="busy"
        :disabled="!repoUrl.trim() || !name || !!portError || !!memoryError"
      />
      <RouterLink v-slot="{ navigate }" :to="{ name: 'home' }" custom>
        <BaseButton variant="ghost" label="Cancel" @click="navigate" />
      </RouterLink>
    </div>
  </form>
</template>

<style scoped>
.hg-new {
  display: grid;
  gap: var(--hg-space-5);
  max-width: 48rem;
}
.hg-new-fields {
  display: grid;
  gap: var(--hg-space-5);
}
.hg-new-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.hg-new-address {
  font-size: var(--hg-size-sm);
  overflow-wrap: anywhere;
}
.hg-new-actions {
  display: flex;
  gap: var(--hg-space-2);
}
@media (max-width: 40rem) {
  .hg-new-grid {
    grid-template-columns: 1fr;
  }
}
</style>
