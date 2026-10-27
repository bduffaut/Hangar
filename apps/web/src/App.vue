<script setup lang="ts">
import { onMounted, ref } from 'vue'

// Placeholder until the Control Tower is built in stage 4.
const health = ref('checking…')

onMounted(async () => {
  try {
    const response = await fetch('/api/health')
    const body = (await response.json()) as { status: string; version: string }
    health.value = `${body.status} (${body.version})`
  } catch {
    health.value = 'server unreachable'
  }
})
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-neutral-950 text-neutral-100">
    <div class="text-center">
      <h1 class="text-3xl font-semibold">Hangar</h1>
      <p class="mt-2 text-neutral-400">Server: {{ health }}</p>
    </div>
  </main>
</template>
