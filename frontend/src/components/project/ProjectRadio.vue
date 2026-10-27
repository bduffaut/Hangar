<script setup lang="ts">
import { emptyCopy, type LogLineView, type ProjectView } from '@hangar/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { openStream, type Stream, streamUrl } from '../../api/streams.ts'
import { BaseButton } from '../../ui/index.ts'
import LogViewer from '../LogViewer.vue'

// Radio: what the running app prints, live. Every connection starts with the app's last 500
// lines, so a reconnect replaces what is shown instead of adding to it.
const props = defineProps<{ project: ProjectView }>()
const MAX_LINES = 5000

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
    streamUrl('runtimeLogs', { id: props.project.id }),
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

onMounted(connect)
onBeforeUnmount(() => {
  stream?.close()
  if (quietTimer) clearTimeout(quietTimer)
})
</script>

<template>
  <div class="hg-radio">
    <div class="hg-radio-status" role="status">
      <span v-if="state === 'not_running'" class="hg-muted">{{ emptyCopy.radio.notRunning }}</span>
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
    <LogViewer :lines="lines" :filename="`${project.name}-runtime.log`" :live="state === 'live'" />
  </div>
</template>

<style scoped>
.hg-radio {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-radio-status {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  min-height: 2rem;
  font-size: var(--hg-size-sm);
}
</style>
