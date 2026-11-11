<script setup lang="ts">
import { type AccessView, githubAppCopy } from '@hangar/shared'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import { BaseButton, BaseMessage, BaseSwitch, useConfirmAction, useNotify } from '../ui/index.ts'
import HgPanel from './HgPanel.vue'

// Who can get in: the GitHub App behind "Sign in with GitHub", created through GitHub's manifest
// flow, and whether anyone may sign up with it (D37, D38).
const route = useRoute()
const router = useRouter()
const notify = useNotify()
const confirm = useConfirmAction()

const access = ref<AccessView | null>(null)
const openSignUp = ref(false)
const busy = ref<string | null>(null)
const error = ref<string | null>(null)

function apply(next: AccessView) {
  access.value = next
  openSignUp.value = next.openSignUp
}

async function act(key: string, action: () => Promise<void>) {
  busy.value = key
  error.value = null
  try {
    await action()
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = null
  }
}

onMounted(async () => {
  // GitHub comes back to /people/github-app?code=…&state=… after creating the app.
  const { code, state } = route.query
  if (route.path === '/people/github-app' && typeof code === 'string') {
    await router.replace('/people')
    await act('app', async () => {
      apply(
        await api('githubAppComplete', {
          body: { code, state: typeof state === 'string' ? state : '' },
        }),
      )
      notify.success(githubAppCopy.created)
    })
  }
  if (!access.value) await act('load', async () => apply(await api('getAccess')))
})

/** A form posted to github.com, where the admin confirms the new app. */
const setUp = () =>
  act('app', async () => {
    const { action, manifest } = await api('githubAppManifest')
    const form = document.createElement('form')
    form.method = 'post'
    form.action = action
    const field = document.createElement('input')
    field.type = 'hidden'
    field.name = 'manifest'
    field.value = manifest
    form.append(field)
    document.body.append(form)
    form.submit()
  })

const manage = () =>
  access.value?.githubApp && window.open(access.value.githubApp.settingsUrl, '_blank', 'noopener')

async function remove() {
  if (!(await confirm({ ...githubAppCopy.removeConfirm, danger: true }))) return
  await act('app', async () => apply(await api('removeGithubApp')))
}

const saveOpen = () =>
  act('open', async () =>
    apply(await api('updateAccess', { body: { openSignUp: openSignUp.value } })),
  )
</script>

<template>
  <HgPanel
    :title="githubAppCopy.title"
    :description="githubAppCopy.description"
    :live="access?.githubApp ? 'on' : 'off'"
  >
    <div class="hg-access">
      <template v-if="access?.githubApp">
        <p class="hg-access-ok">
          {{ githubAppCopy.connected(access.githubApp.slug, access.githubApp.owner) }}
        </p>
        <label class="hg-access-switch">
          <BaseSwitch
            id="open-sign-up"
            v-model="openSignUp"
            :disabled="busy !== null"
            @update:model-value="saveOpen"
          />
          <span>
            <strong>{{ githubAppCopy.openTitle }}</strong>
            <span class="hg-muted">{{ githubAppCopy.openBody }}</span>
          </span>
        </label>
        <p class="hg-muted hg-access-note">{{ githubAppCopy.newAddressHint }}</p>
      </template>
      <p v-else-if="access" class="hg-muted hg-access-note">{{ githubAppCopy.setUpHelp }}</p>
      <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
      <div class="hg-access-actions">
        <template v-if="access?.githubApp">
          <BaseButton icon="github" :label="githubAppCopy.manage" @click="manage" />
          <BaseButton
            variant="ghost"
            :label="githubAppCopy.remove"
            :disabled="busy !== null"
            @click="remove"
          />
        </template>
        <BaseButton
          v-else-if="access"
          variant="primary"
          icon="github"
          :label="githubAppCopy.setUp"
          :loading="busy === 'app'"
          :disabled="busy !== null"
          @click="setUp"
        />
      </div>
    </div>
  </HgPanel>
</template>

<style scoped>
.hg-access {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-access-ok {
  color: var(--hg-status-ready);
}
.hg-access-note {
  font-size: var(--hg-size-sm);
}
.hg-access-switch {
  display: flex;
  align-items: flex-start;
  gap: var(--hg-space-3);
  cursor: pointer;
}
.hg-access-switch > span {
  display: grid;
  gap: 0.15rem;
}
.hg-access-switch .hg-muted {
  font-size: var(--hg-size-sm);
}
.hg-access-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2);
}
</style>
