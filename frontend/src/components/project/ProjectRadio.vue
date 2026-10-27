<script setup lang="ts">
import { emptyCopy, type LogLineView, type ProjectView } from '@hangar/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { openStream, type Stream } from '../../api/streams.ts'
import { BaseButton } from '../../ui/index.ts'
import LogViewer from '../LogViewer.vue'

// Radio: what the running app prints, live. Starts with its last 500 lines.
const props = defineProps<{ project: ProjectView }>()
const MAX_LINES = 5000

const lines = ref<LogLineView[]>([])
const state = ref<'connecting' | 'live' | 'not_running' | 'ended'>('connecting')
let stream: Stream | null = null
let seq = 0

function connect() {
  stream?.close()
  lines.value = []
  seq = 0
  state.value = 'connecting'
  stream = openStream(`/api/projects/${props.project.id}/runtime-logs/stream`, {
    log: (data: { line: string }) => {
      state.value = 'live'
      const next = [
        ...lines.value,
        { seq: seq++, stream: 'stdout' as const, line: data.line, ts: new Date().toISOString() },
      ]
      lines.value = next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
    },
    end: (data: { reason: string }) => {
      state.value = data.reason === 'not_running' ? 'not_running' : 'ended'
      stream?.close()
    },
  })
  // The stream opens before the first line arrives; an app that prints nothing is still live.
  setTimeout(() => {
    if (state.value === 'connecting') state.value = 'live'
  }, 1500)
}

onMounted(connect)
onBeforeUnmount(() => stream?.close())
</script>

<template>
  <div class="hg-radio">
    <div class="hg-radio-status" role="status">
      <span v-if="state === 'not_running'" class="hg-muted">{{ emptyCopy.radio.notRunning }}</span>
      <span v-else-if="state === 'ended'" class="hg-muted"
        >The app stopped. Reconnect after it starts again.</span
      >
      <span v-else-if="state === 'live' && lines.length === 0" class="hg-muted">{{
        emptyCopy.radio.quiet
      }}</span>
      <span v-else-if="state === 'connecting'" class="hg-muted">Tuning in…</span>
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
