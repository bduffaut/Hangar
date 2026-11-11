<script setup lang="ts">
import { type AccountView, accountCopy, navCopy, toastCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { goToGithub } from '../lib/github.ts'
import { useSessionStore } from '../stores/session.ts'
import { type ThemePreference, useTheme } from '../theme/useTheme.ts'
import {
  BaseButton,
  BaseField,
  BaseMessage,
  BasePassword,
  BaseSegmented,
  useConfirmAction,
  useNotify,
} from '../ui/index.ts'

useDocumentTitle(navCopy.account)
const session = useSessionStore()
const router = useRouter()
const route = useRoute()
const notify = useNotify()
const confirm = useConfirmAction()
const theme = useTheme()

const currentPassword = ref('')
const newPassword = ref('')
const firstPassword = ref('')
const githubToken = ref('')
const account = ref<AccountView | null>(null)
const githubApp = computed(() => account.value?.githubApp ?? null)
const showToken = ref(false)
const busy = ref<string | null>(null)
const errors = ref<Record<string, string | null>>({})

const githubConnected = computed(() => account.value?.github.connected ?? false)

async function loadAccount() {
  account.value = await api('getAccount').catch(() => null)
}

onMounted(async () => {
  // GitHub brings people back here after they connect, or choose repositories.
  const back = route.query.github
  if (back === 'linked') notify.success(accountCopy.linkedToast)
  if (back === 'installed') notify.success(accountCopy.installedToast)
  if (back) void router.replace({ query: {} })
  await loadAccount()
})

async function act(key: string, action: () => Promise<void>) {
  busy.value = key
  errors.value = { ...errors.value, [key]: null }
  try {
    await action()
    notify.success(toastCopy.saved)
  } catch (e) {
    errors.value = { ...errors.value, [key]: messageOf(e) }
  } finally {
    busy.value = null
  }
}

const changePassword = () =>
  act('password', async () => {
    session.apply(
      await api('changePassword', {
        body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
      }),
    )
    currentPassword.value = ''
    newPassword.value = ''
  })

const setPassword = () =>
  act('first-password', async () => {
    session.apply(await api('setFirstPassword', { body: { password: firstPassword.value } }))
    firstPassword.value = ''
    await loadAccount()
  })

const saveGithub = (token: string | null) =>
  act('github', async () => {
    await api('setGithubToken', { body: { token } })
    githubToken.value = ''
    showToken.value = false
    await loadAccount()
  })

async function connectWithGithub() {
  busy.value = 'github-app'
  errors.value = { ...errors.value, github: null }
  try {
    await goToGithub({ purpose: 'link' })
  } catch (e) {
    errors.value = { ...errors.value, github: messageOf(e) }
    busy.value = null
  }
}

const chooseRepos = () => window.open(githubApp.value!.installUrl, '_blank', 'noopener')

async function signOutEverywhere() {
  if (!(await confirm({ ...accountCopy.signOutConfirm, danger: true }))) return
  await api('signOutEverywhere')
  session.apply(null)
  await router.push({ name: 'login' })
}

const themeChoice = computed<ThemePreference>({
  get: () => theme.preference.value,
  set: (value) => theme.setPreference(value),
})
const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' },
  { label: 'Match system', value: 'system' },
]
</script>

<template>
  <PageHeader :title="accountCopy.title" />
  <div class="hg-account">
    <HgPanel
      v-if="account && !account.hasPassword"
      :title="accountCopy.firstPasswordTitle"
      :description="accountCopy.firstPasswordBody"
    >
      <form class="hg-form" @submit.prevent="setPassword">
        <BaseField :label="accountCopy.newPassword" for="acc-first" help="At least 10 characters.">
          <BasePassword id="acc-first" v-model="firstPassword" autocomplete="new-password" />
        </BaseField>
        <BaseMessage v-if="errors['first-password']" tone="error">{{
          errors['first-password']
        }}</BaseMessage>
        <div>
          <BaseButton
            type="submit"
            variant="primary"
            :label="accountCopy.setPassword"
            :disabled="!firstPassword || busy !== null"
            :loading="busy === 'first-password'"
          />
        </div>
      </form>
    </HgPanel>

    <HgPanel
      v-else-if="account"
      :title="accountCopy.passwordTitle"
      :description="accountCopy.passwordBody"
    >
      <form class="hg-form" @submit.prevent="changePassword">
        <BaseField :label="accountCopy.currentPassword" for="acc-current">
          <BasePassword
            id="acc-current"
            v-model="currentPassword"
            autocomplete="current-password"
          />
        </BaseField>
        <BaseField :label="accountCopy.newPassword" for="acc-new" help="At least 10 characters.">
          <BasePassword id="acc-new" v-model="newPassword" autocomplete="new-password" />
        </BaseField>
        <BaseMessage v-if="errors.password" tone="error">{{ errors.password }}</BaseMessage>
        <div>
          <BaseButton
            type="submit"
            variant="primary"
            :label="accountCopy.changePassword"
            :disabled="!currentPassword || !newPassword || busy !== null"
            :loading="busy === 'password'"
          />
        </div>
      </form>
    </HgPanel>

    <HgPanel
      title="GitHub"
      :description="githubApp ? accountCopy.githubAppDescription : accountCopy.githubDescription"
    >
      <div class="hg-form">
        <p v-if="account?.github.login && githubConnected" class="hg-connected">
          {{ accountCopy.connectedAs(account.github.login) }}
        </p>
        <p v-else-if="githubConnected" class="hg-connected">{{ accountCopy.connectedToken }}</p>

        <div v-if="githubApp" class="hg-actions">
          <BaseButton
            :variant="githubConnected ? 'secondary' : 'primary'"
            icon="github"
            :label="githubConnected ? accountCopy.reconnectGithub : accountCopy.connectGithub"
            :loading="busy === 'github-app'"
            :disabled="busy !== null"
            @click="connectWithGithub"
          />
          <BaseButton
            v-if="account?.github.kind === 'app'"
            :label="accountCopy.chooseRepos"
            :disabled="busy !== null"
            @click="chooseRepos"
          />
          <BaseButton
            v-if="!showToken"
            variant="ghost"
            :label="accountCopy.useToken"
            @click="showToken = true"
          />
        </div>
        <p v-if="githubApp && account?.github.kind === 'app'" class="hg-muted hg-note">
          {{ accountCopy.chooseReposHelp }}
        </p>

        <template v-if="!githubApp || showToken">
          <BaseField
            :label="githubConnected ? 'Replace token' : 'Token'"
            for="acc-github"
            help="A fine-grained token with read access to Contents and Metadata."
          >
            <BasePassword id="acc-github" v-model="githubToken" autocomplete="off" />
          </BaseField>
          <div>
            <BaseButton
              :variant="githubApp ? 'secondary' : 'primary'"
              icon="github"
              label="Save token"
              :disabled="!githubToken.trim() || busy !== null"
              :loading="busy === 'github'"
              @click="saveGithub(githubToken.trim())"
            />
          </div>
        </template>
        <BaseMessage v-if="errors.github" tone="error">{{ errors.github }}</BaseMessage>
        <div v-if="githubConnected || account?.github.login">
          <BaseButton
            variant="ghost"
            label="Disconnect"
            :disabled="busy !== null"
            @click="saveGithub(null)"
          />
        </div>
      </div>
    </HgPanel>

    <HgPanel title="Appearance">
      <BaseSegmented v-model="themeChoice" :options="themeOptions" label="Color theme" />
    </HgPanel>

    <HgPanel :title="accountCopy.sessionsTitle" :description="accountCopy.sessionsBody">
      <div>
        <BaseButton :label="accountCopy.signOutEverywhere" @click="signOutEverywhere" />
      </div>
    </HgPanel>
  </div>
</template>

<style scoped>
.hg-account {
  display: grid;
  gap: var(--hg-space-5);
  max-width: 48rem;
}
.hg-form {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2);
}
.hg-note {
  font-size: var(--hg-size-sm);
}
.hg-connected {
  color: var(--hg-status-ready);
}
</style>
