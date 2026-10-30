<script setup lang="ts">
import {
  confirmCopy,
  errorCopy,
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  parseWholeNumber,
  MAX_PROJECT_DOMAINS,
  type ProjectView,
  type SettingsView,
  toastCopy,
  TUNNEL_SERVICE_URL,
  type TriggerMode,
  triggerModeCopy,
} from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, messageOf } from '../../api/client.ts'
import { useProjectsStore } from '../../stores/projects.ts'
import {
  BaseButton,
  BaseDialog,
  BaseField,
  BaseInput,
  BaseMessage,
  BaseSelect,
  BaseTextarea,
  type SelectOption,
  useNotify,
} from '../../ui/index.ts'
import CopyField from '../CopyField.vue'
import HgPanel from '../HgPanel.vue'

const props = defineProps<{ project: ProjectView }>()
const projects = useProjectsStore()
const router = useRouter()
const notify = useNotify()

const branch = ref(props.project.branch)
const rootDir = ref(props.project.rootDir)
const port = ref(props.project.port === null ? '' : String(props.project.port))
const memory = ref(String(props.project.memoryLimitMb))
const triggerMode = ref<TriggerMode>(props.project.triggerMode)
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
const busy = ref(false)
const error = ref<string | null>(null)

const triggerOptions = computed<SelectOption<TriggerMode>[]>(() =>
  (Object.keys(triggerModeCopy) as TriggerMode[]).map((mode) => ({
    label: triggerModeCopy[mode].label,
    value: mode,
    hint: triggerModeCopy[mode].meaning,
  })),
)

async function save() {
  if (portError.value || memoryError.value) return
  busy.value = true
  error.value = null
  try {
    const updated = await api('updateProject', {
      params: { id: props.project.id },
      body: {
        branch: branch.value.trim(),
        rootDir: rootDir.value.trim(),
        port: portValue.value,
        memoryLimitMb: memoryValue.value!,
        triggerMode: triggerMode.value,
      },
    })
    projects.upsert(updated)
    notify.success(toastCopy.saved, 'Changes apply on the next deploy.')
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}

// Custom domains: exact addresses on the public side, applied as soon as they are saved.
const domains = ref(props.project.domains.join('\n'))
const domainsBusy = ref(false)
const domainsError = ref<string | null>(null)
const settings = ref<SettingsView | null>(null)
onMounted(async () => {
  settings.value = await api('getSettings').catch(() => null)
})
async function saveDomains() {
  domainsBusy.value = true
  domainsError.value = null
  try {
    const list = domains.value
      .split(/[\s,]+/)
      .map((d) =>
        d
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, ''),
      )
      .filter(Boolean)
    const updated = await api('updateProject', {
      params: { id: props.project.id },
      body: { domains: list },
    })
    projects.upsert(updated)
    domains.value = updated.domains.join('\n')
    notify.success(toastCopy.saved, 'Domains apply right away.')
  } catch (e) {
    domainsError.value = messageOf(e)
  } finally {
    domainsBusy.value = false
  }
}

// GitHub webhook details, for projects that deploy on push.
const webhook = ref<{ url: string | null; secret: string } | null>(null)
onMounted(async () => {
  webhook.value = await api('projectWebhook', { params: { id: props.project.id } }).catch(
    () => null,
  )
})

// Deleting needs the project's name typed out.
const deleting = ref(false)
const confirmName = ref('')
const deleteBusy = ref(false)
async function remove() {
  deleteBusy.value = true
  try {
    await api('deleteProject', { params: { id: props.project.id } })
    projects.remove(props.project.id)
    notify.success(toastCopy.projectDeleted)
    await router.push({ name: 'home' })
  } catch (e) {
    notify.error(messageOf(e))
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div class="hg-settings">
    <HgPanel title="Build and run" description="Changes apply on the next deploy.">
      <form class="hg-settings-form" @submit.prevent="save">
        <BaseField label="Branch" for="ps-branch">
          <BaseInput id="ps-branch" v-model="branch" mono />
        </BaseField>
        <BaseField label="Root directory" for="ps-root" help="Leave empty for the repository root.">
          <BaseInput id="ps-root" v-model="rootDir" mono placeholder="(repository root)" />
        </BaseField>
        <BaseField
          label="Port"
          for="ps-port"
          :error="portError"
          help="Leave empty to detect it, falling back to 3000."
        >
          <BaseInput
            id="ps-port"
            v-model="port"
            :invalid="!!portError"
            mono
            inputmode="numeric"
            placeholder="auto"
          />
        </BaseField>
        <BaseField label="Memory limit (MB)" for="ps-memory" :error="memoryError">
          <BaseInput
            id="ps-memory"
            v-model="memory"
            :invalid="!!memoryError"
            mono
            inputmode="numeric"
          />
        </BaseField>
        <div class="hg-settings-wide">
          <BaseField
            label="New commits"
            for="ps-trigger"
            :help="triggerModeCopy[triggerMode].meaning"
          >
            <BaseSelect id="ps-trigger" v-model="triggerMode" :options="triggerOptions" />
          </BaseField>
        </div>
        <div v-if="error" class="hg-settings-wide">
          <BaseMessage tone="error">{{ error }}</BaseMessage>
        </div>
        <div class="hg-settings-wide">
          <BaseButton
            type="submit"
            variant="primary"
            label="Save changes"
            :loading="busy"
            :disabled="!!portError || !!memoryError"
          />
        </div>
      </form>
    </HgPanel>

    <HgPanel
      title="Custom domains"
      description="Serve this app on your own addresses, like example.com and www.example.com, through your Cloudflare Tunnel."
    >
      <form class="hg-domains" @submit.prevent="saveDomains">
        <BaseMessage v-if="settings && !settings.tunnelConfigured" tone="info">
          Domains answer once public access is set up in Settings.
        </BaseMessage>
        <BaseField
          label="Domains"
          for="ps-domains"
          :error="domainsError"
          :help="`One per line, up to ${MAX_PROJECT_DOMAINS}.`"
        >
          <BaseTextarea
            id="ps-domains"
            v-model="domains"
            mono
            :rows="2"
            placeholder="example.com"
          />
        </BaseField>
        <ol class="hg-domains-steps">
          <li>
            In Cloudflare, open the tunnel Hangar uses and add a public hostname for each domain,
            with this service:
            <CopyField :value="TUNNEL_SERVICE_URL" label="service" />
          </li>
          <li>
            If the domain already points somewhere else, Cloudflare asks to replace that record.
            Replacing it moves the domain's traffic to this app.
          </li>
        </ol>
        <p v-if="project.domains.length" class="hg-domains-live">
          <a
            v-for="domain in project.domains"
            :key="domain"
            :href="`https://${domain}`"
            target="_blank"
            rel="noopener"
            >https://{{ domain }}</a
          >
        </p>
        <div>
          <BaseButton type="submit" label="Save domains" :loading="domainsBusy" />
        </div>
      </form>
    </HgPanel>

    <HgPanel
      v-if="webhook"
      title="GitHub webhook"
      description="Add this in the repository's Settings, under Webhooks, with content type application/json and the push event."
    >
      <BaseMessage v-if="!webhook.url" tone="info">
        Webhooks need public access. Set a public domain in Settings first. Until then, Hangar
        checks for new commits every minute.
      </BaseMessage>
      <div v-else class="hg-webhook">
        <div class="hg-webhook-item">
          <span class="hg-webhook-label">Payload URL</span>
          <CopyField :value="webhook.url" label="payload URL" />
        </div>
        <div class="hg-webhook-item">
          <span class="hg-webhook-label">Secret</span>
          <CopyField :value="webhook.secret" label="webhook secret" secret />
        </div>
      </div>
    </HgPanel>

    <HgPanel title="Delete project" class="hg-danger">
      <p class="hg-muted">{{ confirmCopy.deleteProject.body }}</p>
      <div class="hg-danger-action">
        <BaseButton
          variant="danger"
          icon="trash"
          :label="confirmCopy.deleteProject.action"
          @click="deleting = true"
        />
      </div>
    </HgPanel>

    <BaseDialog v-model:visible="deleting" :title="confirmCopy.deleteProject.title">
      <form class="hg-delete" @submit.prevent="remove">
        <p>{{ confirmCopy.deleteProject.body }}</p>
        <BaseField
          :label="confirmCopy.deleteProject.typeToConfirm(project.name)"
          for="ps-delete-name"
        >
          <BaseInput id="ps-delete-name" v-model="confirmName" mono />
        </BaseField>
        <div class="hg-delete-actions">
          <BaseButton variant="ghost" label="Cancel" @click="deleting = false" />
          <BaseButton
            type="submit"
            variant="danger"
            :label="confirmCopy.deleteProject.action"
            :disabled="confirmName !== project.name"
            :loading="deleteBusy"
          />
        </div>
      </form>
    </BaseDialog>
  </div>
</template>

<style scoped>
.hg-domains {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-domains-steps {
  margin: 0;
  padding-left: 1.25rem;
  display: grid;
  gap: var(--hg-space-2);
  font-size: var(--hg-size-sm);
}
.hg-domains-steps li > :deep(*) {
  margin-top: var(--hg-space-2);
}
.hg-domains-live {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-4);
  font-size: var(--hg-size-sm);
}
.hg-settings {
  display: grid;
  gap: var(--hg-space-5);
  max-width: 48rem;
}
.hg-settings-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--hg-space-5);
}
.hg-settings-wide {
  grid-column: 1 / -1;
}
.hg-webhook {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-webhook-item {
  display: grid;
  gap: var(--hg-space-2);
}
.hg-webhook-label {
  font-weight: var(--hg-weight-regular);
  font-size: var(--hg-size-sm);
}
.hg-danger {
  border-color: color-mix(in srgb, var(--hg-danger) 45%, var(--hg-line));
}
.hg-danger-action {
  margin-top: var(--hg-space-4);
}
.hg-delete {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--hg-space-2);
}
@media (max-width: 36rem) {
  .hg-settings-form {
    grid-template-columns: 1fr;
  }
}
</style>
