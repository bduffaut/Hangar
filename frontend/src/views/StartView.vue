<script setup lang="ts">
import { type AccountView, startCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client.ts'
import AddServerFlow from '../components/AddServerFlow.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { goToGithub } from '../lib/github.ts'
import { useServersStore } from '../stores/servers.ts'
import { BaseButton, BaseIcon, BaseSkeleton } from '../ui/index.ts'

// First steps, in order. Each one is checked against the real state (GitHub, the servers, the
// chosen server's settings and projects), so the list checks itself off as things happen.
useDocumentTitle(startCopy.title)
const servers = useServersStore()
const steps = startCopy.steps

const account = ref<AccountView | null>(null)
const repoCount = ref<number | null>(null)
const internetReady = ref<boolean | null>(null)
const projectCount = ref<number | null>(null)
const loaded = ref(false)
const open = ref<string | null>(null)

/** A server to put apps on: this machine for the owner, or a connected one. */
const serverReady = computed(() => servers.hasServer)
const serverOnline = computed(() => servers.isLocal || (servers.remote?.online ?? false))

async function check() {
  account.value = await api('getAccount').catch(() => null)
  repoCount.value = account.value?.github.connected
    ? await api('githubRepos')
        .then((r) => r.length)
        .catch(() => null)
    : null
  if (serverReady.value && serverOnline.value) {
    const [settings, projects] = await Promise.all([
      api('getSettings').catch(() => null),
      api('listProjects').catch(() => null),
    ])
    internetReady.value = settings
      ? settings.tunnelConfigured && settings.publicDomains.length > 0
      : null
    projectCount.value = projects?.length ?? null
  }
  loaded.value = true
}
onMounted(check)

type Key = 'github' | 'server' | 'repos' | 'internet' | 'publish'
const rows = computed(() => {
  const list: { key: Key; done: boolean; optional?: boolean }[] = [
    { key: 'github', done: account.value?.github.connected ?? false },
    { key: 'server', done: serverReady.value },
    { key: 'repos', done: (repoCount.value ?? 0) > 0 },
    { key: 'internet', done: internetReady.value === true, optional: true },
    { key: 'publish', done: (projectCount.value ?? 0) > 0 },
  ]
  return list
})
/** The first step not done yet; optional ones count once everything else is. */
const current = computed(
  () =>
    rows.value.find((r) => !r.done && !r.optional)?.key ??
    rows.value.find((r) => !r.done)?.key ??
    null,
)
const expanded = (key: Key) => (open.value ?? current.value) === key

function connected(id: string) {
  // Show the new server's apps from now on; this page reloads on it.
  servers.choose(id, '/start')
}
const chooseRepos = () =>
  account.value?.githubApp && window.open(account.value.githubApp.installUrl, '_blank', 'noopener')
</script>

<template>
  <PageHeader :title="startCopy.title" :subtitle="startCopy.subtitle" />

  <div v-if="!loaded" class="hg-start-loading">
    <BaseSkeleton v-for="n in 5" :key="n" height="4rem" />
  </div>

  <ol v-else class="hg-start">
    <li
      v-for="(row, i) in rows"
      :key="row.key"
      class="hg-step"
      :class="{
        'is-done': row.done,
        'is-current': current === row.key,
        'is-open': expanded(row.key),
      }"
    >
      <button
        type="button"
        class="hg-step-head"
        :aria-expanded="expanded(row.key)"
        @click="open = expanded(row.key) ? '' : row.key"
      >
        <span class="hg-step-mark" aria-hidden="true">
          <BaseIcon v-if="row.done" name="check" :size="14" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="hg-step-title">{{ steps[row.key].title }}</span>
        <span class="hg-step-state">
          {{
            row.done
              ? startCopy.done
              : current === row.key
                ? startCopy.next
                : row.optional
                  ? startCopy.optional
                  : ''
          }}
        </span>
      </button>

      <div v-if="expanded(row.key)" class="hg-step-body">
        <p class="hg-muted">{{ steps[row.key].body }}</p>

        <template v-if="row.key === 'github' && !row.done">
          <BaseButton
            v-if="account?.githubApp"
            variant="primary"
            icon="github"
            :label="steps.github.action"
            @click="goToGithub({ purpose: 'link' })"
          />
          <p v-else>
            {{ steps.github.tokenInstead }}
            <RouterLink :to="{ name: 'account' }">{{ steps.github.toAccount }}</RouterLink>
          </p>
        </template>

        <AddServerFlow v-if="row.key === 'server' && !row.done" @connected="connected" />

        <div v-if="row.key === 'repos'" class="hg-step-actions">
          <p v-if="row.done" class="hg-step-ok">{{ steps.repos.found(repoCount ?? 0) }}</p>
          <BaseButton
            v-if="account?.githubApp"
            :variant="row.done ? 'secondary' : 'primary'"
            icon="github"
            :label="steps.repos.action"
            @click="chooseRepos"
          />
          <BaseButton variant="ghost" icon="restart" :label="steps.repos.check" @click="check" />
        </div>

        <div v-if="row.key === 'internet' && !row.done" class="hg-step-actions">
          <RouterLink
            v-slot="{ navigate }"
            :to="{ name: 'settings', params: { section: 'public' } }"
            custom
          >
            <BaseButton
              icon="cloud"
              :label="steps.internet.action"
              :disabled="!serverReady"
              @click="navigate"
            />
          </RouterLink>
          <p class="hg-muted hg-step-note">{{ steps.internet.skip }}</p>
        </div>

        <div v-if="row.key === 'publish' && !row.done" class="hg-step-actions">
          <RouterLink v-slot="{ navigate }" :to="{ name: 'publish' }" custom>
            <BaseButton
              variant="primary"
              icon="upload"
              :label="steps.publish.action"
              :disabled="!serverReady || !account?.github.connected"
              @click="navigate"
            />
          </RouterLink>
        </div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.hg-start-loading {
  display: grid;
  gap: var(--hg-space-3);
  max-width: 52rem;
}
.hg-start {
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 52rem;
  position: relative;
}
/* The course from the first step to the last. */
.hg-start::before {
  content: '';
  position: absolute;
  left: calc(1.1rem + var(--hg-space-4) - 1px);
  top: 2rem;
  bottom: 2rem;
  border-left: 2px dashed var(--hg-line);
}
.hg-step {
  position: relative;
  margin-bottom: var(--hg-space-2);
  background: color-mix(in srgb, var(--hg-panel) 70%, transparent);
  border: 1px solid transparent;
}
.hg-step.is-open {
  background: var(--hg-panel);
  border-color: var(--hg-line);
}
.hg-step-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--hg-space-4);
  padding: var(--hg-space-3) var(--hg-space-4);
  font: inherit;
  color: var(--hg-ink);
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;
}
.hg-step-mark {
  position: relative;
  isolation: isolate;
  flex: none;
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-bold);
  color: var(--hg-ink-muted);
}
.hg-step-mark::before {
  content: '';
  position: absolute;
  inset: 0.32rem;
  z-index: -1;
  background: var(--hg-canvas);
  border: 2px solid var(--hg-line);
  transform: rotate(45deg);
}
.is-current .hg-step-mark {
  color: var(--hg-accent);
}
.is-current .hg-step-mark::before {
  border-color: var(--hg-accent);
}
.is-done .hg-step-mark {
  color: var(--hg-canvas);
}
.is-done .hg-step-mark::before {
  background: var(--hg-status-ready);
  border-color: var(--hg-status-ready);
}
.hg-step-title {
  flex: 1;
  font-size: var(--hg-size-md);
  font-weight: var(--hg-weight-bold);
}
.is-done .hg-step-title {
  color: var(--hg-ink-muted);
}
.hg-step-state {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.is-current .hg-step-state {
  color: var(--hg-accent);
}
.is-done .hg-step-state {
  color: var(--hg-status-ready);
}
.hg-step-body {
  display: grid;
  gap: var(--hg-space-4);
  padding: 0 var(--hg-space-5) var(--hg-space-5) calc(2.2rem + var(--hg-space-4) * 2);
}
.hg-step-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-3);
}
.hg-step-ok {
  color: var(--hg-status-ready);
  flex-basis: 100%;
}
.hg-step-note {
  font-size: var(--hg-size-sm);
}
@media (max-width: 36rem) {
  .hg-step-body {
    padding-left: var(--hg-space-4);
  }
}
</style>
