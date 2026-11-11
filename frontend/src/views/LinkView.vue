<script setup lang="ts">
import { linkCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import BrandMark from '../brand/BrandMark.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { goToGithub } from '../lib/github.ts'
import { useSessionStore } from '../stores/session.ts'
import { BaseButton, BaseField, BaseInput, BaseMessage, BasePassword } from '../ui/index.ts'

// An invite or password reset link. The token sits in the address's #fragment, which is never sent
// to a server; it is removed from the address bar as soon as the page has read it.
const token = window.location.hash.slice(1)
const info = ref<Awaited<ReturnType<typeof api<'checkLink'>>> | null>(null)
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

const session = useSessionStore()
const isInvite = computed(() => info.value?.kind === 'invite')
const withGithub = computed(() => isInvite.value && session.githubSignIn)

async function continueWithGithub() {
  busy.value = true
  error.value = null
  try {
    await goToGithub({
      purpose: 'invite',
      token,
      username: username.value.trim() ? username.value.trim() : undefined,
    })
  } catch (e) {
    error.value = messageOf(e)
    busy.value = false
  }
}
const title = computed(() => {
  if (!info.value) return ''
  if (!info.value.valid) return linkCopy.invalidTitle
  return isInvite.value ? linkCopy.inviteTitle : linkCopy.resetTitle(info.value.username ?? '')
})
useDocumentTitle(linkCopy.inviteTitle)

onMounted(async () => {
  window.history.replaceState(null, '', window.location.pathname)
  info.value = token
    ? await api('checkLink', { body: { token } }).catch(() => ({
        valid: false,
        kind: null,
        username: null,
      }))
    : { valid: false, kind: null, username: null }
})

async function submit() {
  busy.value = true
  error.value = null
  try {
    const body = {
      token,
      username: isInvite.value ? username.value : undefined,
      password: password.value,
    }
    await api('redeemLink', { body })
    // A full load, not a route change: someone already signed in in this browser may be switching
    // accounts, and nothing of the previous account may stay in memory.
    window.location.assign('/')
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="hg-link">
    <form v-if="info" class="hg-link-card" @submit.prevent="submit">
      <BrandMark :size="34" />
      <div class="hg-link-heading">
        <h1>{{ title }}</h1>
        <p class="hg-muted">
          {{
            !info.valid ? linkCopy.invalidBody : isInvite ? linkCopy.inviteBody : linkCopy.resetBody
          }}
        </p>
      </div>
      <template v-if="info.valid">
        <BaseField
          v-if="isInvite"
          :label="withGithub ? linkCopy.usernameOptional : 'Username'"
          for="link-username"
        >
          <BaseInput id="link-username" v-model="username" autocomplete="username" />
        </BaseField>
        <template v-if="withGithub">
          <p class="hg-muted hg-link-note">{{ linkCopy.githubBody }}</p>
          <BaseButton
            variant="primary"
            icon="github"
            :label="linkCopy.withGithub"
            :disabled="busy"
            fluid
            @click="continueWithGithub"
          />
          <p class="hg-link-or" aria-hidden="true">{{ linkCopy.orPassword }}</p>
        </template>
        <BaseField label="Password" for="link-password" help="At least 10 characters.">
          <BasePassword id="link-password" v-model="password" autocomplete="new-password" />
        </BaseField>
        <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
        <BaseButton
          type="submit"
          :variant="withGithub ? 'secondary' : 'primary'"
          :loading="busy"
          :label="isInvite ? linkCopy.create : linkCopy.save"
          fluid
        />
      </template>
      <RouterLink v-else :to="{ name: 'login' }">{{ linkCopy.toSignIn }}</RouterLink>
    </form>
  </main>
</template>

<style scoped>
.hg-link {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--hg-space-4);
}
.hg-link-card {
  width: min(24rem, 100%);
  display: grid;
  gap: var(--hg-space-4);
}
.hg-link-heading {
  display: grid;
  gap: var(--hg-space-1);
}
.hg-link-note {
  font-size: var(--hg-size-sm);
}
.hg-link-or {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--hg-space-3);
  color: var(--hg-ink-muted);
  font-size: var(--hg-size-sm);
}
.hg-link-or::before,
.hg-link-or::after {
  content: '';
  border-top: 1px solid var(--hg-line);
}
.hg-link-heading h1 {
  font-size: var(--hg-size-lg);
}
</style>
