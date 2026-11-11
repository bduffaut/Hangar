<script setup lang="ts">
import { authCopy } from '@hangar/shared'
import { onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import BrandMark from '../brand/BrandMark.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useSessionStore } from '../stores/session.ts'
import { BaseMessage, BaseSpinner } from '../ui/index.ts'

// GitHub sends the browser here after someone authorizes Hangar's app, with ?code=…&state=…
// (or ?error=… when they cancelled). The code works once; the server checks the state against the
// cookie set when this browser left for GitHub.
useDocumentTitle(authCopy.withGithub)
const session = useSessionStore()
const error = ref<string | null>(null)

onMounted(async () => {
  const query = new URLSearchParams(window.location.search)
  const code = query.get('code')
  const state = query.get('state') ?? ''
  // The code must not stay in the address bar or the browser history.
  window.history.replaceState(null, '', window.location.pathname)
  if (!code) {
    error.value = authCopy.githubCancelled
    return
  }
  try {
    const result = await api('githubFinish', { body: { code, state } })
    if (result.session) session.apply(result.session)
    // Nothing shared with the app yet: choosing repositories on GitHub comes next, and GitHub
    // brings them back to Account afterwards.
    if (result.needsInstall && result.installUrl) {
      window.location.assign(result.installUrl)
      return
    }
    // A full load: a new session must not keep anything of an earlier one in memory.
    window.location.assign(result.purpose === 'link' ? '/account?github=linked' : '/')
  } catch (e) {
    error.value = messageOf(e)
  }
})
</script>

<template>
  <main class="hg-callback">
    <div class="hg-callback-card">
      <BrandMark :size="34" />
      <template v-if="error">
        <BaseMessage tone="error">{{ error }}</BaseMessage>
        <RouterLink v-if="session.signedIn" :to="{ name: 'account' }">{{
          authCopy.backToAccount
        }}</RouterLink>
        <RouterLink v-else :to="{ name: 'login' }">{{ authCopy.backToSignIn }}</RouterLink>
      </template>
      <p v-else class="hg-callback-working">
        <BaseSpinner /> <span>{{ authCopy.githubWorking }}</span>
      </p>
    </div>
  </main>
</template>

<style scoped>
.hg-callback {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--hg-space-4);
}
.hg-callback-card {
  width: min(24rem, 100%);
  display: grid;
  gap: var(--hg-space-4);
}
.hg-callback-working {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
}
</style>
