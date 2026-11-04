<script setup lang="ts">
import { addressCopy, type ProjectView } from '@hangar/shared'
import { ref } from 'vue'
import { api, messageOf } from '../../api/client.ts'
import { useNow } from '../../composables/useNow.ts'
import { relativeTime } from '../../lib/format.ts'
import { useProjectsStore } from '../../stores/projects.ts'
import { BaseButton, BaseMessage } from '../../ui/index.ts'

// What Hangar found the last time it really requested each address over the internet. The server
// checks every minute and after every change, and pushes results here; nothing is guessed.
const props = defineProps<{ project: ProjectView }>()
const projects = useProjectsStore()
const now = useNow()
const busy = ref(false)
const error = ref<string | null>(null)

async function checkNow() {
  busy.value = true
  error.value = null
  try {
    projects.upsert(await api('checkProjectAddresses', { params: { id: props.project.id } }))
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="project.addresses.length" class="hg-status-list">
    <ul>
      <li
        v-for="address in project.addresses"
        :key="address.hostname"
        :data-address-status="address.status"
      >
        <div class="hg-status-row">
          <span class="hg-status-mark" :class="`is-${address.status}`" aria-hidden="true" />
          <a :href="address.url" target="_blank" rel="noopener">{{ address.hostname }}</a>
          <strong>{{ addressCopy[address.status].label }}</strong>
          <span v-if="address.checkedAt" class="hg-muted hg-status-time">
            checked {{ relativeTime(address.checkedAt, now) }}
          </span>
        </div>
        <p class="hg-muted">{{ address.message ?? addressCopy[address.status].meaning }}</p>
        <p v-if="address.status !== 'live' && address.lastLiveAt" class="hg-muted hg-status-last">
          Last answered {{ relativeTime(address.lastLiveAt, now) }}.
        </p>
      </li>
    </ul>
    <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
    <div>
      <BaseButton
        size="sm"
        variant="ghost"
        icon="globe"
        label="Check now"
        :loading="busy"
        @click="checkNow"
      />
    </div>
  </div>
</template>

<style scoped>
.hg-status-list {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-status-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-3);
}
.hg-status-list li {
  display: grid;
  gap: var(--hg-space-1);
  padding: var(--hg-space-3);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-md);
}
.hg-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-2);
}
.hg-status-row strong {
  font-weight: var(--hg-weight-regular);
}
.hg-status-time {
  margin-left: auto;
  font-size: var(--hg-size-sm);
}
.hg-status-list p {
  font-size: var(--hg-size-sm);
}
.hg-status-mark {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--hg-caution);
}
.hg-status-mark.is-live {
  background: var(--hg-status-ready);
}
.hg-status-mark.is-checking,
.hg-status-mark.is-not_running {
  background: var(--hg-ink-muted);
}
</style>
