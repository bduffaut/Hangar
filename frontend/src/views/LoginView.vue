<script setup lang="ts">
import { authCopy, brand } from '@hangar/shared'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { messageOf } from '../api/client.ts'
import BrandMark from '../brand/BrandMark.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useSessionStore } from '../stores/session.ts'
import { BaseButton, BaseField, BaseInput, BaseMessage, BasePassword } from '../ui/index.ts'

useDocumentTitle(authCopy.signIn)
const session = useSessionStore()
const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

async function signIn() {
  busy.value = true
  error.value = null
  try {
    await session.login(username.value, password.value)
    const next =
      typeof route.query.next === 'string' && route.query.next.startsWith('/')
        ? route.query.next
        : '/'
    await router.replace(next)
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="hg-login">
    <form class="hg-login-card" @submit.prevent="signIn">
      <BrandMark :size="34" />
      <div class="hg-login-heading">
        <h1>{{ authCopy.signInTitle }}</h1>
        <p class="hg-muted">{{ brand.tagline }}</p>
      </div>
      <BaseField :label="authCopy.username" for="login-username">
        <BaseInput id="login-username" v-model="username" autocomplete="username" />
      </BaseField>
      <BaseField :label="authCopy.password" for="login-password">
        <BasePassword id="login-password" v-model="password" autocomplete="current-password" />
      </BaseField>
      <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
      <BaseButton type="submit" variant="primary" :loading="busy" :label="authCopy.signIn" fluid />
    </form>
  </main>
</template>

<style scoped>
.hg-login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--hg-space-5);
  background:
    linear-gradient(
      180deg,
      transparent 0 calc(100% - 3rem),
      var(--hg-line) calc(100% - 3rem) calc(100% - 3rem + 1px),
      transparent 0
    ),
    var(--hg-canvas);
}
.hg-login-card {
  width: min(24rem, 100%);
  display: grid;
  gap: var(--hg-space-5);
  padding: var(--hg-space-6);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-lg);
}
.hg-login-heading {
  display: grid;
  gap: var(--hg-space-2);
}
.hg-login-heading h1 {
  font-size: var(--hg-size-xl);
}
</style>
