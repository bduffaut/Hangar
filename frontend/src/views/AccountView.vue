<script setup lang="ts">
import { accountCopy, navCopy, toastCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
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
const notify = useNotify()
const confirm = useConfirmAction()
const theme = useTheme()

const currentPassword = ref('')
const newPassword = ref('')
const githubToken = ref('')
const githubConnected = ref<boolean | null>(null)
const githubLogin = ref<string | null>(null)
const busy = ref<string | null>(null)
const errors = ref<Record<string, string | null>>({})

onMounted(async () => {
  githubConnected.value = (await api('getSettings').catch(() => null))?.githubConnected ?? false
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

const saveGithub = (token: string | null) =>
  act('github', async () => {
    const account = await api('setGithubToken', { body: { token } })
    githubLogin.value = account.login
    githubConnected.value = account.connected
    githubToken.value = ''
  })

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
    <HgPanel :title="accountCopy.passwordTitle" :description="accountCopy.passwordBody">
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

    <HgPanel title="GitHub" :description="accountCopy.githubDescription">
      <div class="hg-form">
        <p v-if="githubConnected" class="hg-connected">
          Connected{{ githubLogin ? ` as ${githubLogin}` : '' }}.
        </p>
        <BaseField
          :label="githubConnected ? 'Replace token' : 'Token'"
          for="acc-github"
          help="A fine-grained token with read access to Contents and Metadata."
        >
          <BasePassword id="acc-github" v-model="githubToken" autocomplete="off" />
        </BaseField>
        <BaseMessage v-if="errors.github" tone="error">{{ errors.github }}</BaseMessage>
        <div class="hg-actions">
          <BaseButton
            variant="primary"
            icon="github"
            label="Connect"
            :disabled="!githubToken.trim() || busy !== null"
            :loading="busy === 'github'"
            @click="saveGithub(githubToken.trim())"
          />
          <BaseButton
            v-if="githubConnected"
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
.hg-connected {
  color: var(--hg-status-ready);
}
</style>
