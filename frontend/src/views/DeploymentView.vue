<script setup lang="ts">
import {
  confirmCopy,
  type DeploymentView,
  failureCopy,
  flightRecorderCopy,
  type LogLineView,
  toastCopy,
  triggerCopy,
} from '@hangar/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import { openStream, type Stream } from '../api/streams.ts'
import EmptyState from '../components/EmptyState.vue'
import HgPanel from '../components/HgPanel.vue'
import LogViewer from '../components/LogViewer.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useNow } from '../composables/useNow.ts'
import { absoluteTime, deploymentDuration, formatDuration, shortSha } from '../lib/format.ts'
import { useLiveStore } from '../stores/live.ts'
import { useProjectsStore } from '../stores/projects.ts'
import { BaseButton, BaseIcon, BaseSkeleton, useConfirmAction, useNotify } from '../ui/index.ts'

const route = useRoute()
const live = useLiveStore()
const projects = useProjectsStore()
const notify = useNotify()
const confirm = useConfirmAction()
const now = useNow(1000)

const id = computed(() => String(route.params.id))
const deployment = ref<DeploymentView | null>(null)
const notFound = ref(false)
const lines = ref<LogLineView[]>([])
const streaming = ref(false)
let stream: Stream | null = null

const project = computed(() =>
  deployment.value ? (projects.byId.get(deployment.value.projectId) ?? null) : null,
)
useDocumentTitle(() =>
  deployment.value
    ? `#${deployment.value.number} ${project.value?.name ?? ''}`
    : flightRecorderCopy.title,
)

// The log stream replays the saved lines, then follows new ones. If the connection drops, the
// browser reconnects and resumes after the last line it received.
function follow(deploymentId: string) {
  stream?.close()
  lines.value = []
  streaming.value = true
  stream = openStream(`/api/deployments/${deploymentId}/logs/stream`, {
    log: (line: LogLineView) => {
      if (line.seq > (lines.value.at(-1)?.seq ?? -1)) lines.value.push(line)
    },
    done: () => {
      streaming.value = false
      stream?.close()
    },
  })
}

watch(
  id,
  async (deploymentId) => {
    notFound.value = false
    deployment.value = null
    try {
      deployment.value = await api('getDeployment', { params: { id: deploymentId } })
      follow(deploymentId)
    } catch {
      notFound.value = true
    }
  },
  { immediate: true },
)

const stopListening = live.onDeployment((d) => {
  if (d.id === deployment.value?.id) deployment.value = d
})
onBeforeUnmount(() => {
  stopListening()
  stream?.close()
})

const active = computed(
  () =>
    deployment.value !== null &&
    ['queued', 'building', 'deploying'].includes(deployment.value.status),
)
const duration = computed(() =>
  deployment.value ? deploymentDuration(deployment.value, now.value) : null,
)
const failure = computed(() =>
  deployment.value?.failureCode ? failureCopy[deployment.value.failureCode] : null,
)
const showReason = computed(
  () =>
    deployment.value?.failureReason &&
    !['superseded', 'cancelled_by_user'].includes(deployment.value.failureCode ?? ''),
)

const busy = ref(false)
async function cancel() {
  busy.value = true
  try {
    await api('cancelDeployment', { params: { id: id.value } })
    notify.info(toastCopy.cancelRequested)
  } catch (e) {
    notify.error(messageOf(e))
  } finally {
    busy.value = false
  }
}
async function rollback() {
  if (!(await confirm(confirmCopy.rollback))) return
  busy.value = true
  try {
    await api('rollbackDeployment', { params: { id: id.value } })
    notify.success(toastCopy.rollbackQueued, `Back to #${deployment.value!.number}`)
  } catch (e) {
    notify.error(messageOf(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <template v-if="deployment">
    <PageHeader :title="`Deployment #${deployment.number}`">
      <template #before>
        <RouterLink
          v-if="project"
          :to="{ name: 'project', params: { name: project.name } }"
          class="hg-back"
        >
          {{ project.name }}
        </RouterLink>
      </template>
      <template #meta>
        <div class="hg-deploy-meta">
          <StatusBadge :status="deployment.status" />
          <span v-if="deployment.isCurrent" class="hg-current">Live now</span>
          <span class="hg-muted">{{ triggerCopy[deployment.trigger] }}</span>
        </div>
      </template>
      <template #actions>
        <BaseButton
          v-if="active && deployment.status !== 'deploying'"
          icon="x"
          label="Cancel"
          :loading="busy"
          @click="cancel"
        />
        <BaseButton
          v-if="deployment.status === 'ready' && !deployment.isCurrent"
          icon="rewind"
          label="Roll back to this"
          :loading="busy"
          @click="rollback"
        />
        <a
          v-if="deployment.isCurrent && project?.url"
          :href="project.url"
          target="_blank"
          rel="noopener"
          class="hg-open"
        >
          Open app <BaseIcon name="external" :size="14" />
        </a>
      </template>
    </PageHeader>

    <dl class="hg-facts">
      <div>
        <dt :title="flightRecorderCopy.tailNumberMeaning">{{ flightRecorderCopy.tailNumber }}</dt>
        <dd>
          <code>{{ shortSha(deployment.commitSha) }}</code>
        </dd>
      </div>
      <div class="hg-facts-wide">
        <dt>Commit</dt>
        <dd>
          {{ deployment.commitMessage ?? 'Reading commit details…'
          }}<span v-if="deployment.commitAuthor" class="hg-muted"
            >, {{ deployment.commitAuthor }}</span
          >
        </dd>
      </div>
      <div>
        <dt>Branch</dt>
        <dd>{{ deployment.branch }}</dd>
      </div>
      <div>
        <dt>Duration</dt>
        <dd>{{ duration === null ? 'Waiting to start' : formatDuration(duration) }}</dd>
      </div>
      <div>
        <dt>Started</dt>
        <dd>{{ absoluteTime(deployment.createdAt) }}</dd>
      </div>
    </dl>

    <HgPanel v-if="failure" title="What went wrong" class="hg-failure">
      <p>{{ failure.explanation }}</p>
      <p class="hg-muted">{{ failure.fix }}</p>
      <pre v-if="showReason" class="hg-failure-reason">{{ deployment.failureReason }}</pre>
    </HgPanel>

    <section class="hg-recorder-section" aria-labelledby="recorder-title">
      <h2 id="recorder-title" class="hg-recorder-title">
        {{ flightRecorderCopy.title }}
        <span class="hg-muted">{{ flightRecorderCopy.meaning }}</span>
      </h2>
      <LogViewer
        :lines="lines"
        :filename="`${project?.name ?? 'deployment'}-${deployment.number}.log`"
        :live="streaming && active"
      />
    </section>
  </template>

  <EmptyState
    v-else-if="notFound"
    title="That deployment does not exist."
    body="It may belong to a deleted project."
  >
    <RouterLink v-slot="{ navigate }" :to="{ name: 'home' }" custom>
      <BaseButton variant="primary" label="Back to projects" @click="navigate" />
    </RouterLink>
  </EmptyState>

  <div v-else class="hg-deploy-loading">
    <BaseSkeleton width="14rem" height="2.25rem" />
    <BaseSkeleton height="22rem" />
  </div>
</template>

<style scoped>
.hg-back {
  font-size: var(--hg-size-sm);
  text-decoration: none;
}
.hg-deploy-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-3);
  font-size: var(--hg-size-sm);
}
.hg-current {
  color: var(--hg-status-ready);
  font-weight: var(--hg-weight-medium);
}
.hg-open {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  align-self: center;
  padding: 0 var(--hg-space-2);
}
.hg-facts {
  display: grid;
  grid-template-columns: auto minmax(0, 2fr) repeat(3, auto);
  gap: var(--hg-space-5);
  margin: 0 0 var(--hg-space-5);
  font-size: var(--hg-size-sm);
}
.hg-facts dt {
  color: var(--hg-ink-muted);
  font-size: var(--hg-size-xs);
}
.hg-facts dd {
  margin: var(--hg-space-1) 0 0;
  overflow-wrap: anywhere;
}
.hg-failure {
  margin-bottom: var(--hg-space-5);
  border-color: color-mix(in srgb, var(--hg-status-failed) 50%, var(--hg-line));
  display: grid;
  gap: var(--hg-space-2);
}
.hg-failure-reason {
  margin: var(--hg-space-2) 0 0;
  padding: var(--hg-space-3);
  max-height: 14rem;
  overflow: auto;
  border-radius: var(--hg-radius-md);
  background: var(--hg-console);
  color: var(--hg-console-ink);
  font-size: var(--hg-size-xs);
  white-space: pre-wrap;
}
.hg-recorder-section {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-recorder-title {
  font-size: var(--hg-size-md);
  display: flex;
  align-items: baseline;
  gap: var(--hg-space-2);
}
.hg-recorder-title .hg-muted {
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-regular);
  font-stretch: 100%;
}
.hg-deploy-loading {
  display: grid;
  gap: var(--hg-space-4);
}
@media (max-width: 52rem) {
  .hg-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hg-facts-wide {
    grid-column: 1 / -1;
  }
}
</style>
