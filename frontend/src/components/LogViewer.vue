<script setup lang="ts">
import { flightRecorderCopy, type LogLineView } from '@hangar/shared'
import { computed, nextTick, ref, watch } from 'vue'
import { useClipboard } from '../composables/useClipboard.ts'
import { parseAnsi } from '../lib/ansi.ts'
import { BaseButton, BaseVirtualList } from '../ui/index.ts'

// The Flight Recorder: a terminal-style view of a build log. It follows new lines while you are
// at the bottom, pauses when you scroll up, and offers a way back to the latest line.
const props = defineProps<{ lines: LogLineView[]; filename: string; live: boolean; height?: string }>()

const LINE_HEIGHT = 21
const list = ref<InstanceType<typeof BaseVirtualList> | null>(null)
const following = ref(true)
const copy = useClipboard()

const rows = computed(() =>
  props.lines.map((line) => ({ ...line, segments: parseAnsi(line.line) })),
)

function atBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < LINE_HEIGHT * 2
}

function onScroll(event: Event) {
  following.value = atBottom(event.target as HTMLElement)
}

async function jumpToLatest() {
  following.value = true
  await nextTick()
  list.value?.scrollToEnd(rows.value.length)
}

watch(
  () => rows.value.length,
  async () => {
    if (!following.value) return
    await nextTick()
    list.value?.scrollToEnd(rows.value.length)
  },
)

const plainText = () => props.lines.map((l) => l.line.replace(/\u001b\[[0-9;]*m/g, '')).join('\n')

function download() {
  const url = URL.createObjectURL(new Blob([plainText()], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = props.filename
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="hg-recorder">
    <div class="hg-recorder-toolbar">
      <span class="hg-recorder-count">{{ lines.length }} lines</span>
      <span class="hg-recorder-tools">
        <BaseButton size="sm" variant="ghost" icon="copy" :label="flightRecorderCopy.copy" @click="copy(plainText(), flightRecorderCopy.copied)" />
        <BaseButton size="sm" variant="ghost" icon="download" :label="flightRecorderCopy.download" @click="download" />
      </span>
    </div>
    <div class="hg-recorder-body" role="log" aria-live="off" :aria-label="flightRecorderCopy.title">
      <p v-if="lines.length === 0" class="hg-recorder-waiting">{{ flightRecorderCopy.waiting }}</p>
      <BaseVirtualList
        v-else
        ref="list"
        :items="rows"
        :item-height="LINE_HEIGHT"
        :height="height ?? 'min(65vh, 40rem)'"
        @scroll="onScroll"
      >
        <template #default="{ item }">
          <div class="hg-line" :class="{ 'is-system': item.stream === 'system', 'is-stderr': item.stream === 'stderr' }">
            <span class="hg-line-number" aria-hidden="true">{{ item.seq + 1 }}</span>
            <span class="hg-line-text"><span v-for="(seg, i) in item.segments" :key="i" :class="seg.classes">{{ seg.text }}</span></span>
          </div>
        </template>
      </BaseVirtualList>
      <BaseButton
        v-if="!following && lines.length > 0"
        class="hg-recorder-jump"
        size="sm"
        variant="primary"
        icon="arrowDown"
        :label="flightRecorderCopy.jumpToLatest"
        @click="jumpToLatest"
      />
      <span v-if="live" class="hg-recorder-live" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.hg-recorder {
  border-radius: var(--hg-radius-lg);
  overflow: hidden;
  border: 1px solid var(--hg-line);
  background: var(--hg-console);
  color: var(--hg-console-ink);
}
.hg-recorder-toolbar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--hg-space-2);
  padding: var(--hg-space-1) var(--hg-space-2) var(--hg-space-1) var(--hg-space-4);
  border-bottom: 1px solid color-mix(in srgb, var(--hg-console-ink) 12%, transparent);
  font-size: var(--hg-size-xs);
  color: color-mix(in srgb, var(--hg-console-ink) 70%, transparent);
}
.hg-recorder-toolbar :deep(.p-button) {
  color: var(--hg-console-ink);
}
.hg-recorder-tools {
  display: flex;
}
.hg-recorder-body {
  position: relative;
  font-family: var(--hg-mono);
  font-size: 0.8125rem;
}
.hg-recorder-waiting {
  padding: var(--hg-space-5);
  color: color-mix(in srgb, var(--hg-console-ink) 65%, transparent);
}
.hg-line {
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  height: 21px;
  line-height: 21px;
  white-space: pre;
}
.hg-line:hover {
  background: color-mix(in srgb, var(--hg-console-ink) 5%, transparent);
}
.hg-line-number {
  padding-right: var(--hg-space-3);
  text-align: right;
  color: color-mix(in srgb, var(--hg-console-ink) 35%, transparent);
  user-select: none;
}
.hg-line-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.is-system {
  color: var(--hg-term-accent);
  font-weight: var(--hg-weight-medium);
}
.is-stderr {
  color: color-mix(in srgb, var(--hg-console-ink) 85%, transparent);
}
.hg-recorder-jump {
  position: absolute;
  right: var(--hg-space-4);
  bottom: var(--hg-space-4);
}
.hg-recorder-live {
  position: absolute;
  top: var(--hg-space-3);
  right: var(--hg-space-3);
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--hg-status-building);
  animation: recorder-blink 1.2s ease-in-out infinite;
}
@keyframes recorder-blink {
  50% {
    opacity: 0.25;
  }
}
/* Terminal colors come from the theme (tokens.ts → terminal). */
.ansi-fg-black { color: var(--hg-term-black); }
.ansi-fg-red { color: var(--hg-term-red); }
.ansi-fg-green { color: var(--hg-term-green); }
.ansi-fg-yellow { color: var(--hg-term-yellow); }
.ansi-fg-blue { color: var(--hg-term-blue); }
.ansi-fg-magenta { color: var(--hg-term-magenta); }
.ansi-fg-cyan { color: var(--hg-term-cyan); }
.ansi-fg-white { color: var(--hg-term-white); }
.ansi-bold { font-weight: 700; }
.ansi-dim { opacity: 0.65; }
</style>
