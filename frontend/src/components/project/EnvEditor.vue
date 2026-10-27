<script setup lang="ts">
import { emptyCopy, type ProjectView, toastCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api, messageOf } from '../../api/client.ts'
import { BaseButton, BaseInput, BaseMessage, useNotify } from '../../ui/index.ts'
import EmptyState from '../EmptyState.vue'
import HgPanel from '../HgPanel.vue'

// Environment variables: keys are listed, values stay hidden until revealed one at a time. Editing
// loads every value so the whole set can be saved at once.
const props = defineProps<{ project: ProjectView }>()
const emit = defineEmits<{ deploy: [] }>()
const notify = useNotify()

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const keys = ref<string[]>([])
const revealed = ref<Record<string, string>>({})
const editing = ref(false)
const rows = ref<{ key: string; value: string }[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const savedSinceDeploy = ref(false)

async function load() {
  keys.value = (await api('listEnv', { params: { id: props.project.id } })).keys
}
onMounted(load)

async function reveal(key: string) {
  if (revealed.value[key] !== undefined) {
    const rest = { ...revealed.value }
    delete rest[key]
    revealed.value = rest
    return
  }
  try {
    const { value } = await api('revealEnv', { params: { id: props.project.id, key } })
    revealed.value = { ...revealed.value, [key]: value }
  } catch (e) {
    notify.error(messageOf(e))
  }
}

async function startEditing() {
  busy.value = true
  try {
    const values = await Promise.all(
      keys.value.map((key) => api('revealEnv', { params: { id: props.project.id, key } })),
    )
    rows.value = values.length
      ? values.map(({ key, value }) => ({ key, value }))
      : [{ key: '', value: '' }]
    editing.value = true
  } catch (e) {
    notify.error(messageOf(e))
  } finally {
    busy.value = false
  }
}

const problems = computed(() => {
  const seen = new Set<string>()
  return rows.value.map((row) => {
    if (!row.key && !row.value) return null
    if (!KEY.test(row.key))
      return 'Use letters, digits, and underscores, not starting with a digit.'
    if (seen.has(row.key)) return 'This name is used twice.'
    seen.add(row.key)
    return null
  })
})

async function save() {
  error.value = null
  if (problems.value.some(Boolean)) {
    error.value = 'Fix the highlighted names first.'
    return
  }
  busy.value = true
  try {
    const vars = Object.fromEntries(rows.value.filter((r) => r.key).map((r) => [r.key, r.value]))
    keys.value = (
      await api('replaceEnv', { params: { id: props.project.id }, body: { vars } })
    ).keys
    revealed.value = {}
    editing.value = false
    savedSinceDeploy.value = true
    notify.success(toastCopy.saved)
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}

function deployNow() {
  savedSinceDeploy.value = false
  emit('deploy')
}
</script>

<template>
  <HgPanel
    title="Environment variables"
    description="Encrypted on the server. Your app reads them at runtime, and builds can use them as secrets."
  >
    <template #actions>
      <BaseButton
        v-if="!editing"
        size="sm"
        icon="settings"
        :label="keys.length ? 'Edit' : 'Add variables'"
        :loading="busy"
        @click="startEditing"
      />
    </template>

    <BaseMessage v-if="savedSinceDeploy && !editing" tone="info">
      <span class="hg-env-apply">
        Changes apply on the next deploy.
        <BaseButton
          size="sm"
          variant="primary"
          icon="rocket"
          label="Deploy now"
          @click="deployNow"
        />
      </span>
    </BaseMessage>

    <template v-if="!editing">
      <EmptyState
        v-if="keys.length === 0"
        :title="emptyCopy.env.title"
        :body="emptyCopy.env.body"
      />
      <dl v-else class="hg-env-list">
        <div v-for="key in keys" :key="key" class="hg-env-row">
          <dt>
            <code>{{ key }}</code>
          </dt>
          <dd>
            <code class="hg-env-value">{{ revealed[key] ?? '••••••••••••' }}</code>
            <BaseButton
              size="sm"
              variant="ghost"
              :icon="revealed[key] !== undefined ? 'eyeOff' : 'eye'"
              :aria-label="revealed[key] !== undefined ? `Hide ${key}` : `Show ${key}`"
              @click="reveal(key)"
            />
          </dd>
        </div>
      </dl>
    </template>

    <form v-else class="hg-env-form" @submit.prevent="save">
      <div v-for="(row, i) in rows" :key="i" class="hg-env-edit">
        <div>
          <label class="hg-visually-hidden" :for="`env-key-${i}`">Name</label>
          <BaseInput
            :id="`env-key-${i}`"
            v-model="row.key"
            placeholder="NAME"
            mono
            :invalid="!!problems[i]"
          />
          <p v-if="problems[i]" class="hg-env-problem">{{ problems[i] }}</p>
        </div>
        <div>
          <label class="hg-visually-hidden" :for="`env-value-${i}`">Value</label>
          <BaseInput :id="`env-value-${i}`" v-model="row.value" placeholder="value" mono />
        </div>
        <BaseButton
          size="sm"
          variant="ghost"
          icon="trash"
          :aria-label="`Remove ${row.key || 'this variable'}`"
          @click="rows.splice(i, 1)"
        />
      </div>
      <BaseButton
        size="sm"
        variant="ghost"
        icon="plus"
        label="Add variable"
        @click="rows.push({ key: '', value: '' })"
      />
      <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
      <div class="hg-env-actions">
        <BaseButton type="submit" variant="primary" label="Save" :loading="busy" />
        <BaseButton variant="ghost" label="Cancel" @click="editing = false" />
      </div>
    </form>
  </HgPanel>
</template>

<style scoped>
.hg-env-list {
  margin: 0;
  display: grid;
}
.hg-env-row {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) 2fr;
  gap: var(--hg-space-3);
  align-items: center;
  padding: var(--hg-space-2) 0;
  border-bottom: 1px solid var(--hg-line);
}
.hg-env-row:last-child {
  border-bottom: 0;
}
.hg-env-row dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--hg-space-1);
  min-width: 0;
}
.hg-env-value {
  overflow-x: auto;
  white-space: nowrap;
  font-size: var(--hg-size-sm);
}
.hg-env-form {
  display: grid;
  gap: var(--hg-space-3);
  justify-items: start;
}
.hg-env-edit {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
  gap: var(--hg-space-2);
  align-items: start;
}
.hg-env-problem {
  font-size: var(--hg-size-xs);
  color: var(--hg-danger);
  margin-top: var(--hg-space-1);
}
.hg-env-actions {
  display: flex;
  gap: var(--hg-space-2);
}
.hg-env-apply {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--hg-space-3);
}
@media (max-width: 36rem) {
  .hg-env-row,
  .hg-env-edit {
    grid-template-columns: 1fr;
  }
}
</style>
