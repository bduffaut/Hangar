<script setup lang="ts">
import {
  addressCopy,
  catalogApp,
  confirmCopy,
  projectTabsCopy,
  toastCopy,
  triggerModeCopy,
} from '@hangar/shared'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import CopyField from '../components/CopyField.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import EnvEditor from '../components/project/EnvEditor.vue'
import ProjectDeployments from '../components/project/ProjectDeployments.vue'
import ProjectRadio from '../components/project/ProjectRadio.vue'
import ProjectSettingsForm from '../components/project/ProjectSettingsForm.vue'
import UpdateNotice from '../components/project/UpdateNotice.vue'
import RunwayLights from '../components/RunwayLights.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useNow } from '../composables/useNow.ts'
import { relativeTime, shortSha } from '../lib/format.ts'
import { useProjectsStore } from '../stores/projects.ts'
import {
  BaseButton,
  BaseIcon,
  BaseSkeleton,
  BaseTabs,
  useConfirmAction,
  useNotify,
} from '../ui/index.ts'

type Tab = 'deployments' | 'radio' | 'environment' | 'settings'
const TABS: { value: Tab; label: string; hint?: string }[] = [
  { value: 'deployments', label: projectTabsCopy.deployments },
  { value: 'radio', label: projectTabsCopy.radio, hint: projectTabsCopy.radioMeaning },
  { value: 'environment', label: projectTabsCopy.environment },
  { value: 'settings', label: projectTabsCopy.settings },
]

const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const notify = useNotify()
const confirm = useConfirmAction()
const now = useNow()

const name = computed(() => String(route.params.name))
const project = computed(() => projects.byName.get(name.value) ?? null)
const loading = ref(true)
useDocumentTitle(name)

// A project created moments ago elsewhere (another tab, the CLI) may not be in the list yet, so a
// missing name gets one fresh look before the page says it does not exist.
watch(
  name,
  async () => {
    loading.value = !project.value
    await projects.ensureLoaded().catch(() => {})
    if (!project.value) await projects.load().catch(() => {})
    loading.value = false
  },
  { immediate: true },
)

// The tab lives in the address, so links and the back button work.
const tab = computed<Tab>({
  get: () => {
    const value = String(route.params.tab ?? 'deployments')
    return (TABS.some((t) => t.value === value) ? value : 'deployments') as Tab
  },
  set: (value) =>
    void router.replace({
      name: 'project',
      params: { name: name.value, tab: value === 'deployments' ? undefined : value },
    }),
})

const busy = ref<string | null>(null)
async function act(key: string, action: () => Promise<void>) {
  busy.value = key
  try {
    await action()
  } catch (e) {
    notify.error(messageOf(e))
  } finally {
    busy.value = null
  }
}

const deploy = () =>
  act('deploy', async () => {
    const deployment = await api('deployProject', { params: { id: project.value!.id } })
    notify.success(toastCopy.deployQueued, `#${deployment.number}`)
    await router.push({ name: 'deployment', params: { id: deployment.id } })
  })
const restart = () =>
  act('restart', async () => {
    projects.upsert(await api('restartProject', { params: { id: project.value!.id } }))
    notify.success(toastCopy.restarted)
  })
async function toggleRunning() {
  const p = project.value!
  if (p.desiredState === 'running') {
    if (!(await confirm({ ...confirmCopy.stop, danger: true }))) return
    await act('stop', async () => {
      projects.upsert(await api('stopProject', { params: { id: p.id } }))
      notify.success(toastCopy.stopped)
    })
  } else {
    await act('start', async () => {
      projects.upsert(await api('startProject', { params: { id: p.id } }))
      notify.success(toastCopy.started)
    })
  }
}

// A catalog app's first steps, shown on its page until dismissed.
const template = computed(() =>
  project.value?.catalogId ? catalogApp(project.value.catalogId) : null,
)
const stepsKey = computed(() => `hangar.firstSteps.${project.value?.id}`)
const firstStepsDone = ref(false)
watch(
  stepsKey,
  (key) => {
    try {
      firstStepsDone.value = localStorage.getItem(key) === 'done'
    } catch {
      firstStepsDone.value = false
    }
  },
  { immediate: true },
)
function dismissFirstSteps() {
  firstStepsDone.value = true
  try {
    localStorage.setItem(stepsKey.value, 'done')
  } catch {
    // Private browsing: the steps show again next time, which is harmless.
  }
}
const storageSummary = computed(() => {
  const p = project.value
  if (!p) return ''
  const kept = p.volumes.length
    ? `${p.volumes.length} kept ${p.volumes.length === 1 ? 'folder' : 'folders'}`
    : ''
  const parts = [kept, ...p.libraries.map((l) => l.name)].filter(Boolean)
  return parts.length ? parts.join(', ') : 'None'
})

const running = computed(
  () => project.value?.desiredState === 'running' && project.value.current !== null,
)
</script>

<template>
  <template v-if="project">
    <PageHeader :title="project.name">
      <template #meta>
        <div class="hg-project-meta">
          <StatusBadge v-if="project.latest" :status="project.latest.status" />
          <a
            v-if="project.url && running"
            :href="project.url"
            target="_blank"
            rel="noopener"
            class="hg-project-link"
          >
            {{ project.url.replace(/^https?:\/\//, '') }}
            <BaseIcon name="external" :size="14" />
          </a>
          <span v-else-if="!project.web && running && !project.ports.length" class="hg-muted">
            Other apps reach it at <code>{{ project.name }}:{{ project.port }}</code>
          </span>
          <template v-else-if="!project.web && running">
            <span
              v-for="p in project.ports.filter((p) => p.address)"
              :key="`${p.port}/${p.protocol}`"
              class="hg-project-link"
            >
              <BaseIcon name="server" :size="14" />
              <code>{{ p.address }}</code
              ><span v-if="p.protocol === 'udp'" class="hg-muted"> (UDP)</span>
            </span>
          </template>
          <span v-else-if="project.desiredState === 'stopped'" class="hg-muted">Stopped</span>
          <template v-if="running">
            <a
              v-for="address in project.addresses"
              :key="address.hostname"
              v-hint.bottom="addressCopy[address.status].label"
              :href="address.url"
              target="_blank"
              rel="noopener"
              class="hg-project-link"
            >
              <span class="hg-address-dot" :class="`is-${address.status}`" aria-hidden="true" />
              {{ address.hostname }}
              <span class="hg-visually-hidden">: {{ addressCopy[address.status].label }}</span>
              <BaseIcon name="globe" :size="14" />
            </a>
          </template>
          <span
            v-if="project.hostNetwork"
            v-hint.bottom="'It runs on the computer’s own network, to find devices there'"
            class="hg-muted"
          >
            Also on your home network, port {{ project.port }}
          </span>
          <span v-if="project.kind === 'image'" class="hg-muted hg-project-repo">
            <BaseIcon name="server" :size="14" />
            <code>{{ project.image }}</code>
          </span>
          <span v-else class="hg-muted hg-project-repo">
            <BaseIcon name="branch" :size="14" />
            {{ project.repoUrl.replace(/^https:\/\/(www\.)?/, '') }}, {{ project.branch }}
          </span>
        </div>
      </template>
      <template #actions>
        <BaseButton
          variant="primary"
          :icon="project.kind === 'image' ? 'download' : 'rocket'"
          :label="project.kind === 'image' ? 'Update' : 'Deploy'"
          :loading="busy === 'deploy'"
          :disabled="busy !== null"
          @click="deploy"
        />
        <BaseButton
          v-if="running"
          icon="restart"
          label="Restart"
          :loading="busy === 'restart'"
          :disabled="busy !== null"
          @click="restart"
        />
        <BaseButton
          v-if="project.current"
          :icon="project.desiredState === 'running' ? 'stop' : 'play'"
          :label="project.desiredState === 'running' ? 'Stop' : 'Start'"
          :loading="busy === 'stop' || busy === 'start'"
          :disabled="busy !== null"
          @click="toggleRunning"
        />
      </template>
    </PageHeader>

    <section class="hg-project-summary" aria-label="Summary">
      <div class="hg-summary-item">
        <span class="hg-summary-label">Live version</span>
        <span v-if="project.current">
          #{{ project.current.number }}, <code>{{ shortSha(project.current.commitSha) }}</code
          >{{ ' ' }}
          <span class="hg-muted"> {{ project.current.commitMessage }}</span>
        </span>
        <span v-else class="hg-muted">Nothing live yet</span>
      </div>
      <div class="hg-summary-item">
        <span class="hg-summary-label">Went live</span>
        <span>{{
          project.current?.finishedAt ? relativeTime(project.current.finishedAt, now) : '–'
        }}</span>
      </div>
      <div v-if="project.kind === 'image'" class="hg-summary-item">
        <span class="hg-summary-label">Storage</span>
        <span>{{ storageSummary }}</span>
      </div>
      <div v-else class="hg-summary-item">
        <span class="hg-summary-label">New commits</span>
        <span>{{ triggerModeCopy[project.triggerMode].label }}</span>
      </div>
      <div class="hg-summary-item hg-summary-runway">
        <span class="hg-summary-label">Recent deployments</span>
        <RunwayLights :recent="project.recent" />
      </div>
    </section>

    <UpdateNotice
      v-if="project.kind === 'image'"
      :key="`update-${project.id}`"
      :project="project"
    />

    <section
      v-if="template && project.current && !firstStepsDone"
      class="hg-first-steps"
      aria-labelledby="first-steps-title"
    >
      <div class="hg-first-steps-head">
        <h2 id="first-steps-title">Getting started with {{ template.name }}</h2>
        <BaseButton size="sm" variant="ghost" label="Done" @click="dismissFirstSteps" />
      </div>
      <ol>
        <li v-for="step in template.firstSteps" :key="step">{{ step }}</li>
      </ol>
      <a v-if="project.url" :href="project.url" target="_blank" rel="noopener">
        Open {{ template.name }} <BaseIcon name="external" :size="14" />
      </a>
      <!-- An app that is not a web page (D51): where to connect, ready to paste. -->
      <div v-else-if="project.ports[0]?.address" class="hg-first-steps-address">
        <CopyField :value="project.ports[0].address" label="address" />
      </div>
    </section>

    <BaseTabs :key="project.id" v-model="tab" :tabs="TABS">
      <template #deployments><ProjectDeployments :project="project" /></template>
      <template #radio><ProjectRadio :project="project" /></template>
      <template #environment><EnvEditor :project="project" @deploy="deploy" /></template>
      <template #settings><ProjectSettingsForm :project="project" /></template>
    </BaseTabs>
  </template>

  <div v-else-if="loading" class="hg-project-loading">
    <BaseSkeleton width="16rem" height="2.25rem" />
    <BaseSkeleton height="6rem" />
    <BaseSkeleton height="18rem" />
  </div>

  <EmptyState
    v-else
    :title="`There is no project called ${name}.`"
    body="It may have been deleted, or the address has a typo."
  >
    <RouterLink v-slot="{ navigate }" :to="{ name: 'home' }" custom>
      <BaseButton variant="primary" label="Back to projects" @click="navigate" />
    </RouterLink>
  </EmptyState>
</template>

<style scoped>
.hg-address-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--hg-caution);
}
.hg-address-dot.is-live {
  background: var(--hg-status-ready);
}
.hg-address-dot.is-checking,
.hg-address-dot.is-not_running {
  background: var(--hg-ink-muted);
}
.hg-project-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-2) var(--hg-space-4);
  font-size: var(--hg-size-sm);
}
.hg-project-link,
.hg-project-repo {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  overflow-wrap: anywhere;
}
.hg-project-summary {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)) minmax(0, 1.6fr);
  gap: var(--hg-space-5);
  padding: var(--hg-space-4) var(--hg-space-5);
  margin-bottom: var(--hg-space-5);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-lg);
  background: var(--hg-panel);
}
.hg-summary-item {
  display: grid;
  gap: var(--hg-space-1);
  align-content: start;
  font-size: var(--hg-size-sm);
  min-width: 0;
}
.hg-summary-item > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}
.hg-summary-label {
  color: var(--hg-ink-muted);
  font-size: var(--hg-size-xs);
}
.hg-first-steps {
  display: grid;
  gap: var(--hg-space-3);
  padding: var(--hg-space-4) var(--hg-space-5);
  margin-bottom: var(--hg-space-5);
  border: 1px solid color-mix(in srgb, var(--hg-accent) 40%, var(--hg-line));
  border-left: 2px solid var(--hg-accent);
  background: var(--hg-panel);
}
.hg-first-steps-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--hg-space-3);
}
.hg-first-steps h2 {
  font-size: var(--hg-size-md);
}
.hg-first-steps-address {
  max-width: 28rem;
}
.hg-first-steps ol {
  margin: 0;
  padding-left: 1.3rem;
  display: grid;
  gap: var(--hg-space-2);
  font-size: var(--hg-size-sm);
}
.hg-first-steps a {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-bold);
}
.hg-project-loading {
  display: grid;
  gap: var(--hg-space-4);
}
@media (max-width: 60rem) {
  .hg-project-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 36rem) {
  .hg-project-summary {
    grid-template-columns: 1fr;
  }
}
</style>
