<script setup lang="ts">
import { portLabel, type PublishedPortView } from '@hangar/shared'
import { onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import HgPanel from './HgPanel.vue'
import { BaseMessage } from '../ui/index.ts'

// Every port an app holds on this computer (D51), whoever owns the app: what listens outside
// Hangar's own web entrypoint, in one place, for the admin.
const ports = ref<PublishedPortView[] | null>(null)
const error = ref<string | null>(null)
onMounted(async () => {
  try {
    ports.value = await api('listPorts')
  } catch (e) {
    error.value = messageOf(e)
  }
})
</script>

<template>
  <HgPanel
    title="Ports on this computer"
    description="Apps that are not web pages, like a game server, publish these on this computer's Tailscale address only. Nothing here is open to your home network or the internet."
  >
    <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
    <p v-else-if="ports && !ports.length" class="hg-muted hg-ports-empty">
      No app publishes a port. Web apps answer through Hangar's own address instead.
    </p>
    <table v-else-if="ports" class="hg-ports">
      <thead>
        <tr>
          <th>Port</th>
          <th>App</th>
          <th>Owner</th>
          <th>Connect to</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in ports" :key="`${p.hostPort}/${p.protocol}`">
          <td>
            <code>{{ portLabel(p) }}</code>
          </td>
          <td>
            <RouterLink :to="{ name: 'project', params: { name: p.app } }">{{ p.app }}</RouterLink>
          </td>
          <td>{{ p.owner }}</td>
          <td>
            <code v-if="p.address">{{ p.address }}</code>
          </td>
        </tr>
      </tbody>
    </table>
  </HgPanel>
</template>

<style scoped>
.hg-ports-empty {
  margin: 0;
}
.hg-ports {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--hg-size-sm);
}
.hg-ports th,
.hg-ports td {
  text-align: left;
  padding: var(--hg-space-2) var(--hg-space-3) var(--hg-space-2) 0;
  border-bottom: 1px solid var(--hg-line);
}
.hg-ports th {
  color: var(--hg-ink-muted);
  font-weight: 500;
}
</style>
