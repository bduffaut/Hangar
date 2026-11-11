<script setup lang="ts">
import { type AccountView, checkProjectName, navCopy, publishCopy, schemas } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import type { z } from 'zod'
import { useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useNow } from '../composables/useNow.ts'
import { goToGithub } from '../lib/github.ts'
import { relativeTime } from '../lib/format.ts'
import { useProjectsStore } from '../stores/projects.ts'
import { useServersStore } from '../stores/servers.ts'
import {
  BaseButton,
  BaseIcon,
  BaseInput,
  BaseMessage,
  BaseSkeleton,
  useNotify,
} from '../ui/index.ts'

// Every repository shared with Hangar, one click from running on the chosen server. Publishing
// uses the defaults (detected framework, default branch, the server's default domain) and opens
// the build; "More options" opens the full form with the repository filled in.
type Repo = z.output<typeof schemas.githubRepo>

useDocumentTitle(publishCopy.title)
const router = useRouter()
const notify = useNotify()
const projects = useProjectsStore()
const servers = useServersStore()
const now = useNow()

const account = ref<AccountView | null>(null)
const repos = ref<Repo[] | null>(null)
const query = ref('')
const busy = ref<string | null>(null)
const error = ref<string | null>(null)

const serverName = computed(() =>
  servers.isLocal ? navCopy.thisServer.toLowerCase() : (servers.remote?.name ?? ''),
)

async function load() {
  error.value = null
  account.value = await api('getAccount').catch(() => null)
  await projects.ensureLoaded().catch(() => {})
  if (!account.value?.github.connected) {
    repos.value = []
    return
  }
  try {
    repos.value = await api('githubRepos')
  } catch (e) {
    error.value = messageOf(e)
    repos.value = []
  }
}
onMounted(load)

const normalize = (url: string) =>
  url
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
const projectFor = (repo: Repo) =>
  projects.projects.find((p) => normalize(p.repoUrl) === normalize(repo.url)) ?? null

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (repos.value ?? []).filter((r) => !q || r.fullName.toLowerCase().includes(q))
})

/** A project name from the repository's, made unique on this server. */
function nameFor(repo: Repo) {
  const base =
    repo.fullName
      .split('/')
      .at(-1)!
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 34) || 'app'
  const taken = new Set(projects.projects.map((p) => p.name))
  let name = checkProjectName(base) === 'reserved' ? `${base}-app` : base
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`
  return name
}

async function publish(repo: Repo) {
  busy.value = repo.fullName
  error.value = null
  try {
    const project = await api('createProject', {
      body: { name: nameFor(repo), repoUrl: repo.url, branch: repo.defaultBranch, deploy: true },
    })
    projects.upsert(project)
    notify.success(publishCopy.published(project.name))
    if (project.latest) await router.push({ name: 'deployment', params: { id: project.latest.id } })
    else await router.push({ name: 'project', params: { name: project.name } })
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = null
  }
}

const chooseRepos = () =>
  account.value?.githubApp && window.open(account.value.githubApp.installUrl, '_blank', 'noopener')
</script>

<template>
  <PageHeader :title="publishCopy.title" :subtitle="publishCopy.subtitle(serverName)">
    <template #actions>
      <BaseButton
        v-if="account?.githubApp && account.github.connected"
        variant="ghost"
        icon="github"
        :label="publishCopy.chooseRepos"
        @click="chooseRepos"
      />
    </template>
  </PageHeader>

  <BaseMessage v-if="error" tone="error" class="hg-publish-error">{{ error }}</BaseMessage>

  <div v-if="repos === null" class="hg-publish-loading">
    <BaseSkeleton v-for="n in 6" :key="n" height="3.5rem" />
  </div>

  <div v-else-if="!account?.github.connected" class="hg-publish-empty hg-notched">
    <p>{{ publishCopy.notConnected }}</p>
    <BaseButton
      v-if="account?.githubApp"
      variant="primary"
      icon="github"
      :label="publishCopy.connect"
      @click="goToGithub({ purpose: 'link' })"
    />
    <RouterLink v-else :to="{ name: 'account' }">{{ publishCopy.connect }}</RouterLink>
  </div>

  <template v-else>
    <div class="hg-publish-tools">
      <BaseInput
        id="publish-search"
        v-model="query"
        type="search"
        :placeholder="publishCopy.search"
        :aria-label="publishCopy.search"
      />
      <span class="hg-muted">{{ shown.length }} of {{ repos.length }}</span>
    </div>

    <div v-if="repos.length === 0" class="hg-publish-empty hg-notched">
      <p>{{ publishCopy.empty }}</p>
      <BaseButton
        v-if="account.githubApp"
        variant="primary"
        icon="github"
        :label="publishCopy.chooseRepos"
        @click="chooseRepos"
      />
    </div>
    <p v-else-if="shown.length === 0" class="hg-muted">{{ publishCopy.noMatch }}</p>

    <ul v-else class="hg-repos">
      <li v-for="repo in shown" :key="repo.fullName" class="hg-repo">
        <BaseIcon name="branch" :size="16" class="hg-repo-icon" />
        <div class="hg-repo-main">
          <strong class="hg-repo-name">
            <span class="hg-muted">{{ repo.fullName.split('/')[0] }}/</span
            >{{ repo.fullName.split('/')[1] }}
          </strong>
          <span class="hg-repo-meta">
            <span v-if="repo.private" class="hg-repo-private">{{ publishCopy.private }}</span>
            <span>{{ repo.defaultBranch }}</span>
            <span v-if="repo.updatedAt">{{
              publishCopy.updated(relativeTime(repo.updatedAt, now))
            }}</span>
          </span>
        </div>
        <div class="hg-repo-actions">
          <RouterLink
            v-if="projectFor(repo)"
            v-slot="{ navigate }"
            :to="{ name: 'project', params: { name: projectFor(repo)!.name } }"
            custom
          >
            <BaseButton :label="publishCopy.open" @click="navigate" />
          </RouterLink>
          <template v-else>
            <RouterLink
              class="hg-repo-more"
              :to="{ name: 'new-project', query: { repo: repo.url } }"
              >{{ publishCopy.advanced }}</RouterLink
            >
            <BaseButton
              variant="primary"
              icon="upload"
              :label="busy === repo.fullName ? publishCopy.publishing : publishCopy.publish"
              :loading="busy === repo.fullName"
              :disabled="busy !== null"
              @click="publish(repo)"
            />
          </template>
        </div>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.hg-publish-error {
  margin-bottom: var(--hg-space-4);
}
.hg-publish-loading {
  display: grid;
  gap: var(--hg-space-2);
}
.hg-publish-empty {
  display: grid;
  justify-items: start;
  gap: var(--hg-space-4);
  padding: var(--hg-space-6);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
}
.hg-publish-tools {
  display: flex;
  align-items: center;
  gap: var(--hg-space-4);
  margin-bottom: var(--hg-space-4);
  max-width: 32rem;
  font-size: var(--hg-size-sm);
}
.hg-publish-tools :deep(input) {
  flex: 1;
}
.hg-repos {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--hg-line);
  background: color-mix(in srgb, var(--hg-panel) 85%, transparent);
}
.hg-repo {
  display: flex;
  align-items: center;
  gap: var(--hg-space-4);
  padding: var(--hg-space-3) var(--hg-space-4);
  border-bottom: 1px solid var(--hg-line);
}
.hg-repo:last-child {
  border-bottom: 0;
}
.hg-repo:hover {
  background: color-mix(in srgb, var(--hg-raised) 50%, transparent);
}
.hg-repo-icon {
  color: var(--hg-ink-muted);
}
.hg-repo-main {
  flex: 1;
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.hg-repo-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hg-repo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-3);
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
.hg-repo-private {
  color: var(--hg-caution);
}
.hg-repo-actions {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
}
.hg-repo-more {
  font-size: var(--hg-size-sm);
  white-space: nowrap;
}
@media (max-width: 40rem) {
  .hg-repo {
    flex-wrap: wrap;
  }
  .hg-repo-icon {
    display: none;
  }
  .hg-repo-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
