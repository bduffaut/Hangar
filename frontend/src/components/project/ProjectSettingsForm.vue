<script setup lang="ts">
import {
  confirmCopy,
  errorCopy,
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  parseWholeNumber,
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
  type SelectOption,
  useNotify,
} from '../../ui/index.ts'
import CopyField from '../CopyField.vue'
import AddressEditor from './AddressEditor.vue'
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

// Public addresses: applied as soon as they are saved, no deploy needed.
const hostnames = ref([...props.project.hostnames])
const addressesBusy = ref(false)
const addressesError = ref<string | null>(null)
const addressEditor = ref<InstanceType<typeof AddressEditor> | null>(null)
const addressesChanged = computed(() => hostnames.value.join() !== props.project.hostnames.join())
const settings = ref<SettingsView | null>(null)
onMounted(async () => {
  settings.value = await api('getSettings').catch(() => null)
})
async function saveAddresses() {
  addressesBusy.value = true
  addressesError.value = null
  try {
    const updated = await api('updateProject', {
      params: { id: props.project.id },
      body: { hostnames: hostnames.value },
    })
    projects.upsert(updated)
    hostnames.value = [...updated.hostnames]
    notify.success(toastCopy.saved, 'Addresses apply right away.')
  } catch (e) {
    addressesError.value = messageOf(e)
  } finally {
    addressesBusy.value = false
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
      id="addresses"
      title="Public addresses"
      description="Where the app answers on the internet. Changes apply right away, without a deploy."
    >
      <form class="hg-addresses-form" @submit.prevent="saveAddresses">
        <p v-if="project.url" class="hg-addresses-lan">
          On your network:
          <a :href="project.url" target="_blank" rel="noopener">{{ project.url }}</a>
        </p>
        <template v-if="settings && settings.publicDomains.length">
          <AddressEditor
            ref="addressEditor"
            v-model="hostnames"
            :domains="settings.publicDomains"
            :suggested-name="project.name"
            :saved="project.hostnames"
            id-prefix="ps-address"
          />
          <BaseMessage v-if="!settings.tunnelConfigured" tone="info">
            Addresses answer once a tunnel token is saved in Settings, under Public access.
          </BaseMessage>
          <details class="hg-addresses-help">
            <summary>A new address does not load?</summary>
            <p>
              Names under a domain work once the domain's <code>*</code> hostname is in Hangar's
              tunnel (Settings, Public access). The domain itself, like <code>example.com</code>,
              needs its own public hostname in the tunnel, with this service:
            </p>
            <CopyField :value="TUNNEL_SERVICE_URL" label="service" />
            <p>
              If Cloudflare says the address already exists, it points somewhere else (another
              tunnel or server). Replacing it moves the address to this app. Use Check to confirm.
            </p>
          </details>
          <BaseMessage v-if="addressesError" tone="error">{{ addressesError }}</BaseMessage>
          <div>
            <BaseButton
              type="submit"
              variant="primary"
              label="Save addresses"
              :loading="addressesBusy"
              :disabled="!addressesChanged || addressEditor?.valid === false"
            />
          </div>
        </template>
        <p v-else-if="settings" class="hg-muted">
          This app is on your network only.
          <RouterLink :to="{ name: 'settings', hash: '#public-access' }"
            >Set up public access</RouterLink
          >
          to give it addresses on your own domains.
        </p>
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
.hg-addresses-form {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-addresses-lan {
  font-size: var(--hg-size-sm);
  overflow-wrap: anywhere;
}
.hg-addresses-help {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-addresses-help summary {
  cursor: pointer;
  color: var(--hg-ink);
}
.hg-addresses-help[open] {
  display: grid;
  gap: var(--hg-space-2);
}
.hg-addresses-help p {
  margin-top: var(--hg-space-2);
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
