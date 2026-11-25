<script setup lang="ts">
import { catalogApp, type DeviceView, type ProjectView } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api, messageOf } from '../../api/client.ts'
import { useProjectsStore } from '../../stores/projects.ts'
import HgPanel from '../HgPanel.vue'
import { BaseButton, BaseField, BaseMessage, BaseSelect } from '../../ui/index.ts'

// The USB stick of an app that needs one (D55): an admin swaps it for another, picked from what
// is plugged in. It applies on the next update.
const props = defineProps<{ project: ProjectView }>()
const projects = useProjectsStore()

const need = computed(() => catalogApp(props.project.catalogId ?? '')?.device ?? null)
const current = computed(() => props.project.devices[0] ?? null)
const devices = ref<DeviceView[] | null>(null)
const choice = ref<string | null>(current.value?.path ?? null)
const busy = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)

async function load() {
  devices.value = await api('listDevices').catch(() => [])
}
onMounted(load)

const options = computed(() => {
  const list = (devices.value ?? []).map((d) => ({ label: d.name, value: d.path }))
  // The current stick stays listed while it is unplugged, so the choice shows what is saved.
  if (current.value && !list.some((o) => o.value === current.value!.path)) {
    list.unshift({ label: `${current.value.name} (not plugged in)`, value: current.value.path })
  }
  return list
})
const unplugged = computed(
  () =>
    devices.value !== null &&
    current.value !== null &&
    !devices.value.some((d) => d.path === current.value!.path),
)

async function save() {
  if (!choice.value) return
  busy.value = true
  error.value = null
  saved.value = false
  try {
    projects.upsert(
      await api('updateProject', {
        params: { id: props.project.id },
        body: { device: choice.value },
      }),
    )
    saved.value = true
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <HgPanel
    v-if="need"
    :title="need.label"
    description="Hangar knows the stick by its own name, so it keeps working in another USB socket. A change applies on the next update."
  >
    <div class="hg-device">
      <BaseMessage v-if="unplugged" tone="warn">
        {{ current!.name }} is not plugged in. Plug it back in, or pick another stick.
      </BaseMessage>
      <BaseField v-if="options.length" label="Device" for="dev-choice">
        <BaseSelect id="dev-choice" v-model="choice" :options="options" />
      </BaseField>
      <p v-else-if="devices" class="hg-muted">No USB stick is plugged in.</p>
      <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
      <BaseMessage v-if="saved" tone="success">Saved. Press Update to use it.</BaseMessage>
      <div class="hg-device-actions">
        <BaseButton
          variant="primary"
          label="Save"
          :loading="busy"
          :disabled="!choice || choice === current?.path"
          @click="save"
        />
        <BaseButton variant="ghost" icon="restart" label="Look again" @click="load" />
      </div>
    </div>
  </HgPanel>
</template>

<style scoped>
.hg-device {
  display: grid;
  gap: var(--hg-space-3);
  max-width: 32rem;
}
.hg-device-actions {
  display: flex;
  gap: var(--hg-space-2);
}
</style>
