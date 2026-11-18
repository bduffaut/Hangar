<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useClipboard } from '../composables/useClipboard.ts'
import { INSTALL_COMMAND } from '../site/install.ts'
import { BaseIcon } from '../ui/index.ts'

// The one-line install, as a terminal would show it: one line that never breaks inside the
// address. When it is wider than the screen it scrolls, and a fade at the edge says there is more.
const copy = useClipboard({ quiet: true })
const copied = ref(false)
const line = ref<HTMLElement | null>(null)
const more = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function measure() {
  const el = line.value
  if (el) more.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
async function onCopy() {
  if (!(await copy(INSTALL_COMMAND))) return
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1800)
}
let observer: ResizeObserver | undefined
onMounted(() => {
  measure()
  if (line.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(line.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(timer)
})
</script>

<template>
  <div class="hg-cmd hg-notched">
    <div
      ref="line"
      class="hg-cmd-line"
      :class="{ 'has-more': more }"
      tabindex="0"
      @scroll="measure"
    >
      <span class="hg-cmd-prompt" aria-hidden="true">$</span>
      <code aria-label="Install command">{{ INSTALL_COMMAND }}</code>
    </div>
    <button type="button" class="hg-cmd-copy" @click="onCopy">
      <BaseIcon :name="copied ? 'check' : 'copy'" :size="15" />
      <span aria-live="polite">{{ copied ? 'Copied' : 'Copy' }}</span>
    </button>
  </div>
</template>

<style scoped>
.hg-cmd {
  --hg-notch: 12px;
  --hg-notch-line: color-mix(in srgb, var(--hg-accent) 40%, var(--hg-line));
  display: flex;
  align-items: stretch;
  min-width: 0;
  background: color-mix(in srgb, var(--hg-canvas) 65%, black);
  border: 1px solid color-mix(in srgb, var(--hg-accent) 40%, var(--hg-line));
}
.hg-cmd-line {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  padding: var(--hg-space-4) var(--hg-space-5);
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
  font-family: var(--hg-mono);
  font-size: 0.875rem;
}
.hg-cmd-line::-webkit-scrollbar {
  display: none;
}
.hg-cmd-line.has-more {
  mask-image: linear-gradient(90deg, black calc(100% - 3rem), transparent);
}
.hg-cmd-line:focus-visible {
  outline: 2px solid var(--hg-focus, var(--hg-link));
  outline-offset: -2px;
}
.hg-cmd-prompt {
  color: var(--hg-accent);
  user-select: none;
}
.hg-cmd-line code {
  color: var(--hg-ink);
}
.hg-cmd-copy {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-2);
  min-width: 6.5rem;
  justify-content: center;
  padding: 0 var(--hg-space-5);
  font: inherit;
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-bold);
  color: var(--hg-ink);
  background: color-mix(in srgb, var(--hg-accent) 14%, transparent);
  border: 0;
  border-left: 1px solid color-mix(in srgb, var(--hg-accent) 40%, var(--hg-line));
  cursor: pointer;
}
.hg-cmd-copy:hover {
  background: color-mix(in srgb, var(--hg-accent) 24%, transparent);
}
.hg-cmd-copy:focus-visible {
  outline: 2px solid var(--hg-focus, var(--hg-link));
  outline-offset: -2px;
}
@media (max-width: 36rem) {
  .hg-cmd-line {
    padding: var(--hg-space-3) var(--hg-space-4);
    font-size: 0.8125rem;
  }
  .hg-cmd-copy {
    min-width: 0;
    padding: 0 var(--hg-space-4);
  }
}
</style>
