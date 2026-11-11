<script setup lang="ts">
import { navCopy } from '@hangar/shared'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { LOCAL, useServersStore } from '../stores/servers.ts'
import { BaseIcon } from '../ui/index.ts'

// Which server the dashboard is showing (D38). Everything below the header (projects, logs,
// settings) comes from the chosen one; switching loads the page fresh.
const servers = useServersStore()
const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const here = window.location.hostname

const label = computed(() =>
  servers.isLocal ? navCopy.thisServer : (servers.remote?.name ?? navCopy.noServer),
)
const online = computed(() => servers.isLocal || (servers.remote?.online ?? false))
const options = computed(() => [
  ...(servers.localAllowed
    ? [{ id: LOCAL, name: navCopy.thisServer, detail: here, online: true, paired: true }]
    : []),
  ...servers.servers.map((s) => ({
    id: s.id,
    name: s.name,
    detail: s.info?.hostname ?? (s.paired ? '' : navCopy.notPaired),
    online: s.online,
    paired: s.paired,
  })),
])

function choose(id: string) {
  open.value = false
  if (id !== servers.current) servers.choose(id)
}

const onDocument = (event: Event) => {
  if (!root.value?.contains(event.target as Node)) open.value = false
}
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocument)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocument)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="hg-switch" data-tour="server">
    <button
      type="button"
      class="hg-switch-button"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-label="`${navCopy.switchServer}: ${label}`"
      @click="open = !open"
    >
      <span class="hg-live-dot" :class="{ 'is-off': !online }" aria-hidden="true" />
      <span class="hg-switch-name">{{ label }}</span>
      <BaseIcon name="chevron" :size="14" />
    </button>
    <div v-if="open" class="hg-switch-menu hg-notched" role="menu">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        role="menuitemradio"
        :aria-checked="option.id === servers.current"
        class="hg-switch-item"
        :class="{ 'is-current': option.id === servers.current }"
        @click="choose(option.id)"
      >
        <span class="hg-live-dot" :class="{ 'is-off': !option.online }" aria-hidden="true" />
        <span class="hg-switch-text">
          <strong>{{ option.name }}</strong>
          <span>{{
            option.online ? option.detail : option.paired ? navCopy.offline : navCopy.notPaired
          }}</span>
        </span>
        <BaseIcon v-if="option.id === servers.current" name="check" :size="14" />
      </button>
      <RouterLink class="hg-switch-add" :to="{ name: 'servers' }" @click="open = false">
        <BaseIcon name="plus" :size="14" /> {{ navCopy.addServer }}
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.hg-switch {
  position: relative;
}
.hg-switch-button {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
  height: 2.1rem;
  max-width: 14rem;
  padding: 0 var(--hg-space-3);
  font: inherit;
  font-size: var(--hg-size-sm);
  color: var(--hg-ink);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  cursor: pointer;
}
.hg-switch-button:hover {
  border-color: var(--hg-ink-muted);
}
.hg-switch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-switch-menu {
  position: absolute;
  top: calc(100% + var(--hg-space-2));
  left: 0;
  z-index: 20;
  width: 17rem;
  display: grid;
  padding: var(--hg-space-1);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
}
.hg-switch-item {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  padding: var(--hg-space-2) var(--hg-space-3);
  font: inherit;
  text-align: left;
  color: var(--hg-ink);
  background: none;
  border: 0;
  cursor: pointer;
}
.hg-switch-item:hover,
.hg-switch-item.is-current {
  background: var(--hg-raised);
}
.hg-switch-text {
  flex: 1;
  display: grid;
  min-width: 0;
}
.hg-switch-text strong {
  font-size: var(--hg-size-sm);
}
.hg-switch-text span {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-switch-add {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
  margin-top: var(--hg-space-1);
  padding: var(--hg-space-2) var(--hg-space-3);
  border-top: 1px solid var(--hg-line);
  font-size: var(--hg-size-sm);
  color: var(--hg-link);
  text-decoration: none;
}
</style>
