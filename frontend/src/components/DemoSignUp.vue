<script setup lang="ts">
import { demoCopy } from '@hangar/shared'
import { computed, ref } from 'vue'
import { leaveDemo, signUpPrompt } from '../demo/mode.ts'
import { useSessionStore } from '../stores/session.ts'
import { BaseButton, BaseDialog } from '../ui/index.ts'

// On the tour: a strip under the header saying this is a sample, and the prompt to sign up that
// opens when a visitor tries something that needs an account, or finishes the tour.
const session = useSessionStore()
const canSignUp = computed(() => session.githubSignIn && session.openSignUp)
const busy = ref(false)

const visible = computed({
  get: () => signUpPrompt.value !== null,
  set: (open) => {
    if (!open) signUpPrompt.value = null
  },
})
const lede = computed(() => {
  const reason = signUpPrompt.value
  if (reason === 'tour-done' || reason === 'banner') return demoCopy.promptTourDone
  return demoCopy.promptAction((reason && demoCopy.actions[reason]) ?? demoCopy.fallbackAction)
})

/** Leaves the tour first, so the sign-up talks to this site for real. */
function signUp() {
  busy.value = true
  leaveDemo('/welcome?signup=github')
}
</script>

<template>
  <div class="hg-demo-strip" role="note">
    <p>
      <span class="hg-demo-long">{{ demoCopy.banner }}</span
      ><span class="hg-demo-short">{{ demoCopy.bannerShort }}</span>
    </p>
    <div class="hg-demo-strip-actions">
      <BaseButton
        size="sm"
        variant="primary"
        :label="demoCopy.bannerAction"
        @click="signUpPrompt = 'banner'"
      />
      <BaseButton
        size="sm"
        variant="ghost"
        :label="demoCopy.bannerLeave"
        @click="leaveDemo('/welcome')"
      />
    </div>
  </div>

  <BaseDialog v-model:visible="visible" :title="demoCopy.promptTitle" width="30rem">
    <p class="hg-demo-lede">{{ lede }}</p>
    <ol class="hg-demo-steps">
      <li v-for="(step, i) in demoCopy.promptSteps" :key="step">
        <span class="hg-demo-num" aria-hidden="true">{{ i + 1 }}</span>
        <span>{{ step }}</span>
      </li>
    </ol>
    <p v-if="!canSignUp" class="hg-muted hg-demo-note">{{ demoCopy.promptInviteOnly }}</p>
    <template #footer>
      <div class="hg-demo-actions">
        <BaseButton variant="ghost" :label="demoCopy.promptKeepLooking" @click="visible = false" />
        <BaseButton
          variant="secondary"
          :label="demoCopy.promptSignIn"
          @click="leaveDemo('/login')"
        />
        <BaseButton
          v-if="canSignUp"
          variant="primary"
          icon="github"
          :loading="busy"
          :label="demoCopy.promptGithub"
          @click="signUp"
        />
        <a
          v-else
          class="hg-demo-selfhost"
          href="https://github.com/bduffaut/Hangar#run-hangar-yourself"
          rel="noopener"
          >{{ demoCopy.promptSelfHost }}</a
        >
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.hg-demo-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--hg-space-2) var(--hg-space-4);
  padding: var(--hg-space-2) var(--hg-space-4);
  background: color-mix(in srgb, var(--hg-accent-fill) 14%, var(--hg-canvas));
  border-bottom: 1px solid color-mix(in srgb, var(--hg-accent-fill) 35%, var(--hg-line));
  font-size: 0.875rem;
}
.hg-demo-strip p {
  margin: 0;
}
.hg-demo-short {
  display: none;
}
@media (max-width: 40rem) {
  .hg-demo-strip {
    justify-content: space-between;
    flex-wrap: nowrap;
    padding: var(--hg-space-2) var(--hg-space-3);
  }
  .hg-demo-long,
  .hg-demo-strip-actions :deep(.p-button-text) {
    display: none;
  }
  .hg-demo-short {
    display: inline;
  }
}
.hg-demo-strip-actions {
  display: flex;
  gap: var(--hg-space-2);
}
.hg-demo-lede {
  margin: 0 0 var(--hg-space-4);
}
.hg-demo-steps {
  display: grid;
  gap: var(--hg-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.hg-demo-steps li {
  display: flex;
  gap: var(--hg-space-3);
  align-items: baseline;
}
.hg-demo-num {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 1px solid var(--hg-accent-fill);
  color: var(--hg-accent-fill);
  font-size: 0.75rem;
  font-weight: 700;
}
.hg-demo-note {
  margin: var(--hg-space-4) 0 0;
}
.hg-demo-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--hg-space-2);
}
.hg-demo-selfhost {
  font-weight: 600;
}
</style>
