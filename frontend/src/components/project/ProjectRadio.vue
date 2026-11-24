<script setup lang="ts">
import { emptyCopy, type LogLineView, type ProjectView, type ServiceView } from '@hangar/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '../../api/client.ts'
import { openStream, type Stream, streamUrl } from '../../api/streams.ts'
import { BaseButton } from '../../ui/index.ts'
import LogViewer from '../LogViewer.vue'

// Radio: what the running app prints, live. Every connection starts with the app's last 500
// lines, so a reconnect replaces what is shown instead of adding to it. An app made of several
// parts (D44) lists them with how each is doing, and any of them can be tuned in.
const props = defineProps<{ project: ProjectView }>()
const MAX_LINES = 5000
const PARTS_REFRESH_MS = 10_000
const copy = emptyCopy.radio

/** The parts besides the app itself; empty for an app of one part. '' is the app. */
const parts = ref<ServiceView[]>([])
const part = ref('')
/** An image without its digest: the tag says which version, the digest only pins it. */
const shortImage = (image: string) => image.replace(/@sha256:[a-f0-9]+$/, '')
const appState = computed(() =>
  props.project.desiredState === 'stopped'
    ? 'stopped'
    : props.project.current
      ? 'running'
      : 'missing',
)
let partsTimer: ReturnType<typeof setInterval> | null = null
async function loadParts() {
  // Only catalog apps can have parts.
  if (!props.project.catalogId) return
  parts.value = await api('projectServices', { params: { id: props.project.id } }).catch(
    () => parts.value,
  )
}

// Appended in place: copying thousands of lines for every new one is wasted work.
const lines = ref<LogLineView[]>([])
const state = ref<'connecting' | 'live' | 'not_running' | 'ended' | 'reconnecting'>('connecting')
let stream: Stream | null = null
let quietTimer: ReturnType<typeof setTimeout> | null = null
let seq = 0

function reset() {
  lines.value = []
  seq = 0
}

function connect() {
  stream?.close()
  reset()
  state.value = 'connecting'
  stream = openStream(
    streamUrl('runtimeLogs', { id: props.project.id }, part.value ? { part: part.value } : {}),
    {
      log: (data: { line: string }) => {
        state.value = 'live'
        const list = lines.value
        list.push({ seq: seq++, stream: 'stdout', line: data.line, ts: new Date().toISOString() })
        if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES)
      },
      end: (data: { reason: string }) => {
        state.value = data.reason === 'not_running' ? 'not_running' : 'ended'
        stream?.close()
      },
    },
    {
      onOpen: (reconnect) => {
        if (reconnect) reset()
        // The stream opens before the first line arrives; an app that prints nothing is live.
        if (quietTimer) clearTimeout(quietTimer)
        quietTimer = setTimeout(() => {
          if (state.value === 'connecting' || state.value === 'reconnecting') state.value = 'live'
        }, 1500)
      },
      onError: () => {
        if (state.value === 'live' || state.value === 'connecting') state.value = 'reconnecting'
      },
    },
  )
}

onMounted(() => {
  connect()
  void loadParts()
  partsTimer = setInterval(() => void loadParts(), PARTS_REFRESH_MS)
})
watch(part, connect)
onBeforeUnmount(() => {
  if (partsTimer) clearInterval(partsTimer)
  stream?.close()
  if (quietTimer) clearTimeout(quietTimer)
})
</script>

<template>
  <div class="hg-radio">
    <div v-if="parts.length" class="hg-radio-parts" role="group" :aria-label="copy.parts">
      <button
        type="button"
        class="hg-radio-part"
        :class="`is-${appState}`"
        :aria-pressed="part === ''"
        @click="part = ''"
      >
        <span class="hg-radio-dot" aria-hidden="true" />{{ copy.app }}
      </button>
      <button
        v-for="p in parts"
        :key="p.name"
        v-hint.top="`${copy.partStates[p.state]} · ${shortImage(p.image)}`"
        type="button"
        class="hg-radio-part"
        :class="`is-${p.state}`"
        :aria-pressed="part === p.name"
        :aria-label="`${p.name}: ${copy.partStates[p.state]}`"
        @click="part = p.name"
      >
        <span class="hg-radio-dot" aria-hidden="true" />{{ p.name }}
      </button>
    </div>
    <div class="hg-radio-status" role="status">
      <span v-if="state === 'not_running'" class="hg-muted">{{
        part ? copy.partNotRunning : copy.notRunning
      }}</span>
      <span v-else-if="state === 'ended'" class="hg-muted">{{ emptyCopy.radio.ended }}</span>
      <span v-else-if="state === 'reconnecting'" class="hg-muted">{{
        emptyCopy.radio.reconnecting
      }}</span>
      <span v-else-if="state === 'live' && lines.length === 0" class="hg-muted">{{
        emptyCopy.radio.quiet
      }}</span>
      <span v-else-if="state === 'connecting'" class="hg-muted">{{
        emptyCopy.radio.connecting
      }}</span>
      <BaseButton
        v-if="state === 'ended' || state === 'not_running'"
        size="sm"
        icon="restart"
        label="Reconnect"
        @click="connect"
      />
    </div>
    <LogViewer
      :lines="lines"
      :filename="`${project.name}${part ? `-${part}` : ''}-runtime.log`"
      :live="state === 'live'"
    />
  </div>
</template>

<style scoped>
.hg-radio {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-radio-parts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2);
}
.hg-radio-part {
  --light: var(--hg-status-cancelled);
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-2);
  padding: var(--hg-space-1) var(--hg-space-3);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-md);
  background: transparent;
  color: var(--hg-ink-muted);
  font: inherit;
  font-size: var(--hg-size-sm);
  cursor: pointer;
}
.hg-radio-part[aria-pressed='true'] {
  background: var(--hg-raised);
  color: var(--hg-ink);
  border-color: color-mix(in srgb, var(--hg-ink-muted) 50%, var(--hg-line));
}
.hg-radio-part:focus-visible {
  outline: 2px solid var(--hg-accent);
  outline-offset: 2px;
}
.hg-radio-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--light);
}
.hg-radio-part.is-running {
  --light: var(--hg-status-ready);
}
.hg-radio-part.is-starting {
  --light: var(--hg-status-building);
}
.hg-radio-part.is-unhealthy {
  --light: var(--hg-status-failed);
}
.hg-radio-status {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  min-height: 2rem;
  font-size: var(--hg-size-sm);
}
</style>
