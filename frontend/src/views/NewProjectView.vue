<script setup lang="ts">
import {
  appHostname,
  errorCopy,
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  navCopy,
  parseDotenv,
  parseWholeNumber,
  type SettingsView,
  type TriggerMode,
  triggerModeCopy,
} from '@hangar/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import HgPanel from '../components/HgPanel.vue'
import AddressEditor from '../components/project/AddressEditor.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useProjectsStore } from '../stores/projects.ts'
import {
  BaseButton,
  BaseField,
  BaseInput,
  BaseMessage,
  BaseSelect,
  BaseSwitch,
  BaseTextarea,
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

const settings = ref<SettingsView | null>(null)
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
const deployNow = ref(true)
const envText = ref('')
const env = computed(() => parseDotenv(envText.value))
const envCount = computed(() => Object.keys(env.value.vars).length)
const envError = computed(() =>
  env.value.badLines.length
    ? `Line ${env.value.badLines.join(', ')} is not KEY=value. Names use letters, digits, and underscores.`
    : null,
)
const busy = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  settings.value = await api('getSettings')
  triggerMode.value = settings.value.defaultDomain ? 'webhook' : 'poll'
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

// Public addresses start as <name>.<default domain> and follow the name until edited.
const domains = computed(() => settings.value?.publicDomains ?? [])
const suggested = computed(() =>
  settings.value?.defaultDomain && name.value
    ? [appHostname(name.value, settings.value.defaultDomain)]
    : [],
)
const hostnames = ref<string[]>([])
const addressesEdited = ref(false)
watch(suggested, (next) => {
  if (!addressesEdited.value) hostnames.value = next
})
watch(hostnames, (next) => {
  addressesEdited.value = next.join() !== suggested.value.join()
})
const addressEditor = ref<InstanceType<typeof AddressEditor> | null>(null)
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

const blocked = computed(
  () =>
    !repoUrl.value.trim() ||
    !name.value ||
    !!portError.value ||
    !!memoryError.value ||
    !!envError.value ||
    addressEditor.value?.valid === false,
)

async function create() {
  if (blocked.value) return
  busy.value = true
  error.value = null
  try {
    // Variables are saved before the first build, so the first deployment already has them.
    const project = await api('createProject', {
      body: {
        name: name.value,
        repoUrl: repoUrl.value.trim(),
        branch: branch.value.trim() || undefined,
        rootDir: rootDir.value.trim() || undefined,
        port: portValue.value,
        memoryLimitMb: memoryValue.value!,
        triggerMode: triggerMode.value,
        hostnames: domains.value.length ? hostnames.value : undefined,
        deploy: deployNow.value && envCount.value === 0,
      },
    })
    projects.upsert(project)
    let deploymentId = project.latest?.id ?? null
    if (envCount.value > 0) {
      await api('replaceEnv', { params: { id: project.id }, body: { vars: env.value.vars } })
      if (deployNow.value) {
        deploymentId = (await api('deployProject', { params: { id: project.id } })).id
      }
    }
    if (deploymentId) await router.push({ name: 'deployment', params: { id: deploymentId } })
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

    <HgPanel
      title="Name and addresses"
      description="Where people will find the app. Every project gets a network address; public addresses go through your Cloudflare Tunnel."
    >
      <div class="hg-new-fields">
        <BaseField
          label="Project name"
          for="new-name"
          help="Lowercase letters, digits, and dashes. It names the app's addresses."
        >
          <BaseInput id="new-name" v-model="name" mono @input="nameTouched = true" />
        </BaseField>
        <div class="hg-new-where">
          <h3 class="hg-new-where-title">On your network</h3>
          <p v-if="address" class="hg-new-address">
            <code>{{ address }}</code>
            <span class="hg-muted">Always on, for devices on your network.</span>
          </p>
          <p v-else class="hg-muted hg-new-address">Enter a name to see the address.</p>
        </div>
        <div class="hg-new-where">
          <h3 class="hg-new-where-title">On the internet</h3>
          <template v-if="domains.length">
            <AddressEditor
              ref="addressEditor"
              v-model="hostnames"
              :domains="domains"
              :suggested-name="name"
              id-prefix="new-address"
            />
            <p class="hg-muted hg-new-hint">
              Suggested: the project name on your default domain. Leave the name empty to use the
              domain itself, choose another of your domains, add more, or remove them all to keep
              the app on your network.
            </p>
          </template>
          <p v-else class="hg-muted hg-new-address">
            Not set up yet, so the app stays on your network.
            <RouterLink :to="{ name: 'settings', hash: '#public-access' }"
              >Set up public access</RouterLink
            >
            to put apps on your own domain.
          </p>
        </div>
      </div>
    </HgPanel>

    <HgPanel
      title="Build and run"
      description="These defaults suit most apps. Show options to change them."
    >
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
      <dl v-else class="hg-new-defaults">
        <div>
          <dt>Root directory</dt>
          <dd>{{ rootDir.trim() || 'Repository root' }}</dd>
        </div>
        <div>
          <dt>Port</dt>
          <dd>{{ portValue ?? 'Detected (3000 if unsure)' }}</dd>
        </div>
        <div>
          <dt>Memory limit</dt>
          <dd>{{ memory }} MB</dd>
        </div>
        <div>
          <dt>New commits</dt>
          <dd>{{ triggerModeCopy[triggerMode].label }}</dd>
        </div>
      </dl>
    </HgPanel>

    <HgPanel
      title="Environment variables"
      description="Optional. Settings your app reads, like API keys. Encrypted, and available from the first build."
    >
      <BaseField
        label="Variables"
        for="new-env"
        :error="envError"
        :help="
          envCount
            ? `${envCount} ${envCount === 1 ? 'variable' : 'variables'} ready.`
            : 'One KEY=value per line. You can paste a .env file.'
        "
      >
        <BaseTextarea
          id="new-env"
          v-model="envText"
          :rows="3"
          mono
          placeholder="DATABASE_URL=postgres://…"
        />
      </BaseField>
    </HgPanel>

    <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
    <div class="hg-new-switch">
      <BaseSwitch id="new-deploy" v-model="deployNow" />
      <label for="new-deploy">
        Deploy right away
        <span class="hg-muted">Off: create the project now and deploy it later from its page.</span>
      </label>
    </div>
    <div class="hg-new-actions">
      <BaseButton
        type="submit"
        variant="primary"
        :icon="deployNow ? 'rocket' : 'plus'"
        :label="deployNow ? 'Create and deploy' : 'Create project'"
        :loading="busy"
        :disabled="blocked"
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
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-1) var(--hg-space-3);
  font-size: var(--hg-size-sm);
  overflow-wrap: anywhere;
}
.hg-new-where {
  display: grid;
  gap: var(--hg-space-2);
}
.hg-new-where-title {
  font-size: var(--hg-size-sm);
}
.hg-new-hint {
  font-size: var(--hg-size-xs);
}
.hg-new-defaults {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--hg-space-3);
  font-size: var(--hg-size-sm);
}
.hg-new-defaults dt {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
.hg-new-defaults dd {
  margin: 0;
}
.hg-new-switch {
  display: flex;
  gap: var(--hg-space-3);
  align-items: flex-start;
}
.hg-new-switch label {
  display: grid;
  gap: 0.15rem;
}
.hg-new-switch .hg-muted {
  font-size: var(--hg-size-sm);
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
