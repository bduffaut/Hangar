<script setup lang="ts">
import { instrumentsCopy, type SystemInfo } from '@hangar/shared'
import { onMounted, ref } from 'vue'
import { api } from '../../api/client.ts'
import { cleanCpuModel, formatBytes } from '../../lib/format.ts'

// The machine's fixed details: what Hangar runs on and which version it is.
const info = ref<SystemInfo | null>(null)
onMounted(async () => {
  info.value = await api('systemInfo').catch(() => null)
})
</script>

<template>
  <div class="hg-machine">
    <p v-if="!info" class="hg-muted">{{ instrumentsCopy.waiting }}</p>
    <dl v-else>
      <div v-if="info.cpuModel">
        <dt>Processor</dt>
        <dd>{{ cleanCpuModel(info.cpuModel) }}</dd>
      </div>
      <div v-if="info.cpuThreads">
        <dt>Threads</dt>
        <dd class="hg-data">{{ info.cpuThreads }}</dd>
      </div>
      <div v-if="info.kernel">
        <dt>Kernel</dt>
        <dd>Linux {{ info.kernel }}</dd>
      </div>
      <div>
        <dt>App images</dt>
        <dd class="hg-data">{{ formatBytes(info.imageDiskBytes) }}</dd>
      </div>
      <div>
        <dt>{{ instrumentsCopy.version }}</dt>
        <dd>
          <code>{{ info.version }}</code>
        </dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.hg-machine {
  padding: 0 var(--hg-space-4) var(--hg-space-4);
  font-size: var(--hg-size-sm);
}
dl {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2) var(--hg-space-6);
}
dt {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
dd {
  margin: 0;
}
</style>
