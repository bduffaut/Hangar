<script setup lang="ts">
import { type ServerPairing, startCopy } from '@hangar/shared'
import { computed, onBeforeUnmount, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import { useServersStore } from '../stores/servers.ts'
import { BaseButton, BaseField, BaseInput, BaseMessage, BaseSpinner } from '../ui/index.ts'
import CopyField from './CopyField.vue'

// Adding a server: a name, then a one-time command to run on that machine, then a wait that ends
// by itself when the server connects. `pairing` resumes with a command made elsewhere.
const props = defineProps<{ pairing?: ServerPairing | null }>()
const emit = defineEmits<{ connected: [id: string] }>()
const copy = startCopy.steps.server
const servers = useServersStore()

const name = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const pairing = ref<ServerPairing | null>(props.pairing ?? null)
const connected = ref(false)
let poll: ReturnType<typeof setInterval> | null = null

const server = computed(() =>
  pairing.value ? servers.servers.find((s) => s.id === pairing.value!.server.id) : null,
)

function watchForIt() {
  poll ??= setInterval(async () => {
    await servers.refresh()
    if (server.value?.online) {
      connected.value = true
      if (poll) clearInterval(poll)
      poll = null
      emit('connected', server.value.id)
    }
  }, 3000)
}
if (pairing.value) watchForIt()
onBeforeUnmount(() => poll && clearInterval(poll))

async function create() {
  busy.value = true
  error.value = null
  try {
    pairing.value = await api('addServer', { body: { name: name.value || copy.namePlaceholder } })
    await servers.refresh()
    watchForIt()
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form v-if="!pairing" class="hg-add" @submit.prevent="create">
    <BaseField :label="copy.nameLabel" for="add-server-name">
      <BaseInput
        id="add-server-name"
        v-model="name"
        :placeholder="copy.namePlaceholder"
        autocomplete="off"
      />
    </BaseField>
    <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
    <div>
      <BaseButton
        type="submit"
        variant="primary"
        icon="server"
        :label="copy.create"
        :loading="busy"
      />
    </div>
  </form>

  <div v-else class="hg-add">
    <template v-if="!connected">
      <p>{{ copy.run }}</p>
      <CopyField :value="pairing.installCommand" label="Install command" />
      <p class="hg-muted hg-add-note">{{ copy.expires }}</p>
      <div class="hg-add-wait" role="status">
        <BaseSpinner />
        <div>
          <strong>{{ copy.waiting }}</strong>
          <p class="hg-muted">{{ copy.waitingHelp }}</p>
        </div>
      </div>
      <details class="hg-add-trouble">
        <summary>{{ copy.trouble }}</summary>
        <ul>
          <li v-for="tip in copy.troubleSteps" :key="tip">{{ tip }}</li>
        </ul>
      </details>
    </template>
    <p v-else class="hg-add-done" role="status">
      <span class="hg-live-dot" aria-hidden="true" />
      {{ copy.connected(server?.name ?? pairing.server.name) }}
    </p>
  </div>
</template>

<style scoped>
.hg-add {
  display: grid;
  gap: var(--hg-space-4);
  max-width: 44rem;
}
.hg-add-note {
  font-size: var(--hg-size-sm);
  margin-top: calc(-1 * var(--hg-space-2));
}
.hg-add-wait {
  display: flex;
  align-items: flex-start;
  gap: var(--hg-space-3);
  padding: var(--hg-space-4);
  background: color-mix(in srgb, var(--hg-status-building) 8%, transparent);
  border-left: 2px solid var(--hg-status-building);
}
.hg-add-wait strong {
  font-size: var(--hg-size-sm);
}
.hg-add-wait p {
  font-size: var(--hg-size-sm);
}
.hg-add-trouble {
  font-size: var(--hg-size-sm);
}
.hg-add-trouble summary {
  cursor: pointer;
  color: var(--hg-link);
}
.hg-add-trouble ul {
  margin: var(--hg-space-2) 0 0;
  padding-left: 1.1rem;
  color: var(--hg-ink-muted);
  display: grid;
  gap: var(--hg-space-1);
}
.hg-add-done {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
  color: var(--hg-status-ready);
  font-weight: var(--hg-weight-bold);
}
</style>
