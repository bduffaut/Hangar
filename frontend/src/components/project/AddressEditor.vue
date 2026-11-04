<script setup lang="ts">
import { joinPublicHostname, RESERVED_NAMES, splitPublicHostname } from '@hangar/shared'
import { computed, ref, watch } from 'vue'
import { useSessionStore } from '../../stores/session.ts'
import { BaseButton, BaseInput, BaseSelect } from '../../ui/index.ts'

// A project's public addresses, one row each: a name and one of the owner's domains, read like
// the address itself (https:// name . domain). An empty name means the domain itself.
const session = useSessionStore()
const hostnames = defineModel<string[]>({ required: true })
const props = defineProps<{
  /** The owner's domains, default first. */
  domains: string[]
  /** Name suggested for a new row, usually the project name. */
  suggestedName: string
  idPrefix: string
}>()

interface Row {
  key: number
  subdomain: string
  domain: string
}
let nextKey = 0
const toRows = (list: string[]): Row[] =>
  list.map((hostname) => {
    const address = splitPublicHostname(hostname, props.domains) ?? {
      subdomain: hostname,
      domain: props.domains[0] ?? '',
    }
    return { key: nextKey++, ...address }
  })
const rows = ref<Row[]>(toRows(hostnames.value))
const joined = (list: Row[]) => list.map((r) => joinPublicHostname(r).toLowerCase())

// Rows are the source while editing; the model follows them and is re-read only when it changes
// from outside (a save, or the project name changing a suggested row).
watch(
  rows,
  (list) => {
    const next = joined(list)
    if (next.join() !== hostnames.value.join()) hostnames.value = next
  },
  { deep: true },
)
watch(hostnames, (list) => {
  if (list.join() !== joined(rows.value).join()) rows.value = toRows(list)
})

const domainOptions = computed(() => props.domains.map((d) => ({ label: d, value: d })))
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

function problemOf(row: Row, index: number): string | null {
  const name = row.subdomain.trim().toLowerCase()
  if (name && !LABEL.test(name)) {
    return name.includes('.')
      ? 'Use a single name, without dots. Cloudflare covers one level under your domain.'
      : 'Use lowercase letters, digits, and dashes, not at the start or end.'
  }
  if (name === 'tower' || name === 'hooks') return 'This name is reserved for Hangar itself.'
  if (!session.isAdmin && (!name || RESERVED_NAMES.has(name))) {
    return 'Only an admin can use this address. Pick another name.'
  }
  const hostname = joinPublicHostname({ subdomain: name, domain: row.domain })
  if (joined(rows.value).indexOf(hostname) !== index) return 'This address is already listed.'
  return null
}
const problems = computed(() => rows.value.map(problemOf))
defineExpose({ valid: computed(() => problems.value.every((p) => p === null)) })

function add() {
  const domain = props.domains[0] ?? ''
  const taken = new Set(joined(rows.value))
  const subdomain = taken.has(joinPublicHostname({ subdomain: props.suggestedName, domain }))
    ? ''
    : props.suggestedName
  rows.value = [...rows.value, { key: nextKey++, subdomain, domain }]
}
function remove(key: number) {
  rows.value = rows.value.filter((r) => r.key !== key)
}
</script>

<template>
  <div class="hg-addresses">
    <ul v-if="rows.length" class="hg-address-list">
      <li v-for="(row, index) in rows" :key="row.key" class="hg-address">
        <div class="hg-address-row">
          <span class="hg-address-scheme" aria-hidden="true">https://</span>
          <label :for="`${idPrefix}-name-${row.key}`" class="hg-visually-hidden">
            Name under the domain (leave empty for the domain itself)
          </label>
          <BaseInput
            :id="`${idPrefix}-name-${row.key}`"
            v-model="row.subdomain"
            class="hg-address-name"
            placeholder="(root)"
            mono
            :invalid="!!problems[index]"
          />
          <span class="hg-address-dot" aria-hidden="true">.</span>
          <label :for="`${idPrefix}-domain-${row.key}`" class="hg-visually-hidden">Domain</label>
          <BaseSelect
            :id="`${idPrefix}-domain-${row.key}`"
            v-model="row.domain"
            class="hg-address-domain"
            mono
            :options="domainOptions"
          />
          <span class="hg-address-actions">
            <BaseButton
              v-hint.top="'Remove this address'"
              size="sm"
              variant="ghost"
              icon="x"
              :aria-label="`Remove ${joinPublicHostname(row)}`"
              @click="remove(row.key)"
            />
          </span>
        </div>
        <p v-if="problems[index]" class="hg-address-problem" role="alert">
          {{ problems[index] }}
        </p>
      </li>
    </ul>
    <p v-else class="hg-muted hg-address-none">
      No public addresses: the app is reachable on your network only.
    </p>
    <div>
      <BaseButton size="sm" icon="plus" label="Add an address" @click="add" />
    </div>
  </div>
</template>

<style scoped>
.hg-addresses {
  container-type: inline-size;
  display: grid;
  gap: var(--hg-space-3);
}
.hg-address-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-3);
}
.hg-address {
  display: grid;
  gap: var(--hg-space-1);
}
.hg-address-row {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
}
.hg-address-scheme,
.hg-address-dot {
  font-family: var(--hg-mono);
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-address-name {
  flex: 1 1 8rem;
  min-width: 0;
}
.hg-address-domain {
  flex: 1 1 11rem;
  min-width: 0;
}
.hg-address-problem {
  display: flex;
  align-items: flex-start;
  gap: var(--hg-space-1);
  font-size: var(--hg-size-sm);
  color: var(--hg-danger);
}
.hg-address-none {
  font-size: var(--hg-size-sm);
}
.hg-address-actions {
  display: flex;
  gap: var(--hg-space-1);
}
/* Narrow: the address on one line, its buttons on the next. */
@container (max-width: 32rem) {
  .hg-address-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.4fr);
    row-gap: var(--hg-space-1);
  }
  .hg-address-scheme {
    display: none;
  }
  .hg-address-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
