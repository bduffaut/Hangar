<script setup lang="ts">
import { navCopy, type ServerPairing, type ServerView, serversCopy } from '@hangar/shared'
import { onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import AddServerFlow from '../components/AddServerFlow.vue'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useNow } from '../composables/useNow.ts'
import { formatBytes, relativeTime } from '../lib/format.ts'
import { LOCAL, useServersStore } from '../stores/servers.ts'
import {
  BaseButton,
  BaseDialog,
  BaseField,
  BaseInput,
  BaseMessage,
  useConfirmAction,
  useNotify,
} from '../ui/index.ts'

useDocumentTitle(serversCopy.title)
const servers = useServersStore()
const confirm = useConfirmAction()
const notify = useNotify()
const now = useNow()
const host = window.location.host

const adding = ref(false)
const pairing = ref<ServerPairing | null>(null)
const renaming = ref<ServerView | null>(null)
const newName = ref('')
const error = ref<string | null>(null)

onMounted(() => servers.refresh())

const status = (s: ServerView) =>
  s.online ? navCopy.online : s.paired ? navCopy.offline : navCopy.notPaired

async function remove(s: ServerView) {
  if (!(await confirm({ ...serversCopy.removeConfirm(s.name), danger: true }))) return
  try {
    await api('removeServer', { params: { id: s.id } })
    if (servers.current === s.id) servers.choose(LOCAL, '/servers')
    else await servers.refresh()
  } catch (e) {
    notify.error(messageOf(e))
  }
}

async function newCommand(s: ServerView) {
  if (
    !(await confirm({
      title: serversCopy.newCommand,
      body: serversCopy.newCommandBody,
      action: serversCopy.newCommand,
    }))
  )
    return
  try {
    pairing.value = await api('newPairingCode', { params: { id: s.id } })
    adding.value = true
  } catch (e) {
    notify.error(messageOf(e))
  }
}

function startRename(s: ServerView) {
  renaming.value = s
  newName.value = s.name
  error.value = null
}
async function rename() {
  if (!renaming.value) return
  try {
    await api('renameServer', { params: { id: renaming.value.id }, body: { name: newName.value } })
    renaming.value = null
    await servers.refresh()
  } catch (e) {
    error.value = messageOf(e)
  }
}

function closeAdd() {
  adding.value = false
  pairing.value = null
}
</script>

<template>
  <PageHeader :title="serversCopy.title" :subtitle="serversCopy.subtitle">
    <template #actions>
      <BaseButton
        v-if="!adding"
        variant="primary"
        icon="plus"
        :label="serversCopy.add"
        @click="adding = true"
      />
    </template>
  </PageHeader>

  <HgPanel
    v-if="adding"
    :title="serversCopy.add"
    :description="serversCopy.addBody"
    class="hg-servers-add"
  >
    <template #actions>
      <BaseButton variant="ghost" size="sm" icon="x" aria-label="Close" @click="closeAdd" />
    </template>
    <AddServerFlow :pairing="pairing" @connected="(id) => servers.choose(id)" />
  </HgPanel>

  <div class="hg-servers">
    <article
      v-if="servers.localAllowed"
      class="hg-server hg-notched"
      :class="{ 'is-current': servers.isLocal }"
    >
      <header class="hg-server-head">
        <span class="hg-live-dot" aria-hidden="true" />
        <h2>{{ serversCopy.here }}</h2>
        <span v-if="servers.isLocal" class="hg-server-badge">{{ serversCopy.showing }}</span>
      </header>
      <p class="hg-muted hg-server-note">{{ serversCopy.hereBody }}</p>
      <dl class="hg-readout">
        <dt>{{ serversCopy.fields.address }}</dt>
        <dd class="hg-mono">{{ host }}</dd>
      </dl>
      <footer v-if="!servers.isLocal" class="hg-server-actions">
        <BaseButton
          v-if="!servers.isLocal"
          icon="server"
          :label="serversCopy.open"
          @click="servers.choose(LOCAL)"
        />
      </footer>
    </article>

    <article
      v-for="s in servers.servers"
      :key="s.id"
      class="hg-server hg-notched"
      :class="{ 'is-current': servers.current === s.id, 'is-off': !s.online }"
    >
      <header class="hg-server-head">
        <span class="hg-live-dot" :class="{ 'is-off': !s.online }" aria-hidden="true" />
        <h2>{{ s.name }}</h2>
        <span v-if="servers.current === s.id" class="hg-server-badge">{{
          serversCopy.showing
        }}</span>
        <span class="hg-server-status">{{ status(s) }}</span>
      </header>
      <dl v-if="s.info" class="hg-readout">
        <dt>{{ serversCopy.fields.machine }}</dt>
        <dd>{{ s.info.hostname }}</dd>
        <dt>{{ serversCopy.fields.system }}</dt>
        <dd>{{ s.info.os }}, {{ s.info.arch }}</dd>
        <dt>{{ serversCopy.fields.cpu }}</dt>
        <dd>{{ s.info.cpus }} {{ s.info.cpus === 1 ? 'core' : 'cores' }}</dd>
        <dt>{{ serversCopy.fields.memory }}</dt>
        <dd>{{ formatBytes(s.info.memoryBytes) }}</dd>
        <dt v-if="s.info.lanIp">{{ serversCopy.fields.address }}</dt>
        <dd v-if="s.info.lanIp" class="hg-mono">{{ s.info.lanIp }}</dd>
        <dt>{{ serversCopy.fields.version }}</dt>
        <dd>{{ s.info.version }}</dd>
        <dt v-if="!s.online">{{ serversCopy.lastSeen }}</dt>
        <dd v-if="!s.online">
          {{ s.lastSeenAt ? relativeTime(s.lastSeenAt, now) : serversCopy.never }}
        </dd>
      </dl>
      <p v-else class="hg-muted hg-server-note">{{ serversCopy.never }}</p>
      <footer class="hg-server-actions">
        <BaseButton
          v-if="servers.current !== s.id"
          icon="server"
          :label="serversCopy.open"
          :disabled="!s.paired"
          @click="servers.choose(s.id)"
        />
        <BaseButton variant="ghost" size="sm" :label="serversCopy.rename" @click="startRename(s)" />
        <BaseButton
          variant="ghost"
          size="sm"
          :label="serversCopy.newCommand"
          @click="newCommand(s)"
        />
        <BaseButton
          variant="ghost"
          size="sm"
          icon="trash"
          :label="serversCopy.remove"
          @click="remove(s)"
        />
      </footer>
    </article>

    <p v-if="!servers.localAllowed && servers.servers.length === 0 && !adding" class="hg-muted">
      {{ serversCopy.empty }}
    </p>
  </div>

  <BaseDialog
    :visible="renaming !== null"
    :title="serversCopy.rename"
    @update:visible="(v: boolean) => !v && (renaming = null)"
  >
    <form class="hg-rename" @submit.prevent="rename">
      <BaseField label="Name" for="rename-server">
        <BaseInput id="rename-server" v-model="newName" />
      </BaseField>
      <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
      <div class="hg-rename-actions">
        <BaseButton variant="ghost" label="Cancel" @click="renaming = null" />
        <BaseButton type="submit" variant="primary" label="Save" />
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped>
.hg-servers-add {
  margin-bottom: var(--hg-space-5);
}
.hg-servers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(22rem, 100%), 1fr));
  gap: var(--hg-space-4);
}
.hg-server {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: var(--hg-space-3);
  padding: var(--hg-space-4) var(--hg-space-5);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
}
.hg-server.is-current {
  --hg-notch-line: var(--hg-accent);
  border-color: color-mix(in srgb, var(--hg-accent) 65%, var(--hg-line));
}
.hg-server-head {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
  min-width: 0;
}
.hg-server-head h2 {
  font-size: var(--hg-size-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-server-badge {
  font-size: var(--hg-size-xs);
  padding: 0.1rem var(--hg-space-2);
  color: var(--hg-accent);
  border: 1px solid color-mix(in srgb, var(--hg-accent) 50%, transparent);
}
.hg-server-status {
  margin-left: auto;
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-server-note {
  font-size: var(--hg-size-sm);
}
.hg-server-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-1);
  padding-top: var(--hg-space-2);
  border-top: 1px solid var(--hg-line);
}
.hg-mono {
  font-family: var(--hg-mono);
}
.hg-rename {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--hg-space-2);
}
</style>
