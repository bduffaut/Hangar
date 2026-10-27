<script setup lang="ts">
import {
  appHostname,
  brand,
  type DeploymentView,
  type ProjectView,
  setupCopy,
  statusCopy,
  TEST_FLIGHT,
  towerHostname,
} from '@hangar/shared'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, messageOf } from '../api/client.ts'
import BrandMark from '../brand/BrandMark.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useLiveStore } from '../stores/live.ts'
import { useProjectsStore } from '../stores/projects.ts'
import { useSessionStore } from '../stores/session.ts'
import {
  BaseButton,
  BaseField,
  BaseIcon,
  BaseInput,
  BaseMessage,
  BasePassword,
} from '../ui/index.ts'

useDocumentTitle(setupCopy.title)
const router = useRouter()
const session = useSessionStore()
const live = useLiveStore()
const projects = useProjectsStore()

const steps = [
  setupCopy.steps.account,
  setupCopy.steps.address,
  setupCopy.steps.github,
  setupCopy.steps.testFlight,
]
// Someone already signed in has finished step one and is continuing the checklist.
const step = ref(session.signedIn ? 1 : 0)
const busy = ref(false)
const error = ref<string | null>(null)

async function run(action: () => Promise<void>) {
  busy.value = true
  error.value = null
  try {
    await action()
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}

// Step 1: account
const setupCode = ref('')
const username = ref('')
const password = ref('')
const createAccount = () =>
  run(async () => {
    await session.completeSetup({
      setupCode: setupCode.value,
      username: username.value,
      password: password.value,
    })
    // The account exists now; move on even if reading the suggested address fails.
    step.value = 1
    await loadAddress().catch(() => {})
  })

// Step 2: address
const lanIp = ref('')
async function loadAddress() {
  const settings = await api('getSettings')
  lanIp.value = settings.lanIp ?? ''
}
if (session.signedIn) void loadAddress()
const preview = computed(() => {
  const ip = lanIp.value.trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null
  const domain = `${ip.replaceAll('.', '-')}.sslip.io`
  return { tower: towerHostname(domain), app: appHostname('blog', domain) }
})
const saveAddress = () =>
  run(async () => {
    await api('updateSettings', { body: { lanIp: lanIp.value.trim() } })
    step.value = 2
  })

// Step 3: GitHub
const githubToken = ref('')
const githubLogin = ref<string | null>(null)
const connectGithub = () =>
  run(async () => {
    const account = await api('setGithubToken', { body: { token: githubToken.value.trim() } })
    githubLogin.value = account.login
    githubToken.value = ''
    step.value = 3
  })

// Step 4: test flight
const flight = ref<ProjectView | null>(null)
const flightDeployment = ref<DeploymentView | null>(null)
const takeTestFlight = () =>
  run(async () => {
    await projects.load()
    let project = projects.byName.get(TEST_FLIGHT.name) ?? null
    if (!project) {
      project = await api('createProject', {
        body: {
          name: TEST_FLIGHT.name,
          repoUrl: TEST_FLIGHT.repoUrl,
          branch: TEST_FLIGHT.branch,
          rootDir: TEST_FLIGHT.rootDir,
          triggerMode: 'manual',
        },
      })
      projects.upsert(project)
      flightDeployment.value = project.latest
    } else {
      flightDeployment.value = await api('deployProject', { params: { id: project.id } })
    }
    flight.value = project
  })
const stopListening = live.onDeployment((deployment) => {
  if (deployment.id === flightDeployment.value?.id) flightDeployment.value = deployment
})
onBeforeUnmount(stopListening)
watch(
  () => session.signedIn,
  (signedIn) => signedIn && live.connect(),
  { immediate: true },
)

const flightUrl = computed(() => flight.value?.url ?? null)
const finish = () => router.push({ name: 'home' })

// Each step replaces the last, so move keyboard and screen-reader focus to its heading.
watch(step, async () => {
  error.value = null
  await nextTick()
  document.getElementById('step-title')?.focus()
})
</script>

<template>
  <div class="hg-setup">
    <aside class="hg-setup-aside">
      <BrandMark :size="34" />
      <h1>{{ setupCopy.title }}</h1>
      <p class="hg-muted">{{ setupCopy.intro }}</p>
      <ol class="hg-setup-steps" aria-label="Setup steps">
        <li
          v-for="(item, i) in steps"
          :key="item.title"
          :class="{ 'is-current': i === step, 'is-done': i < step }"
          :aria-current="i === step ? 'step' : undefined"
        >
          <span class="hg-setup-marker" aria-hidden="true">
            <BaseIcon v-if="i < step" name="check" :size="14" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span>{{ item.title }}</span>
        </li>
      </ol>
    </aside>

    <main class="hg-setup-main">
      <section v-if="step === 0" class="hg-setup-panel" aria-labelledby="step-title">
        <h2 id="step-title" tabindex="-1">{{ setupCopy.steps.account.title }}</h2>
        <p class="hg-muted">{{ setupCopy.steps.account.body }}</p>
        <form class="hg-setup-form" @submit.prevent="createAccount">
          <BaseField
            :label="setupCopy.steps.account.codeLabel"
            for="setup-code"
            :help="setupCopy.steps.account.codeHelp"
          >
            <BaseInput
              id="setup-code"
              v-model="setupCode"
              mono
              autocomplete="one-time-code"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            />
          </BaseField>
          <BaseField
            label="Username"
            for="setup-username"
            :help="setupCopy.steps.account.usernameHelp"
          >
            <BaseInput id="setup-username" v-model="username" autocomplete="username" />
          </BaseField>
          <BaseField
            label="Password"
            for="setup-password"
            :help="setupCopy.steps.account.passwordHelp"
          >
            <BasePassword id="setup-password" v-model="password" autocomplete="new-password" />
          </BaseField>
          <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
          <BaseButton
            type="submit"
            variant="primary"
            :loading="busy"
            :label="setupCopy.steps.account.action"
          />
        </form>
      </section>

      <section v-else-if="step === 1" class="hg-setup-panel" aria-labelledby="step-title">
        <h2 id="step-title" tabindex="-1">{{ setupCopy.steps.address.title }}</h2>
        <p class="hg-muted">{{ setupCopy.steps.address.body }}</p>
        <form class="hg-setup-form" @submit.prevent="saveAddress">
          <BaseField
            :label="setupCopy.steps.address.ipLabel"
            for="setup-ip"
            :help="setupCopy.steps.address.ipHelp"
          >
            <BaseInput id="setup-ip" v-model="lanIp" mono inputmode="numeric" />
          </BaseField>
          <dl v-if="preview" class="hg-setup-preview">
            <div>
              <dt>{{ brand.dashboardName }}</dt>
              <dd>
                <code>http://{{ preview.tower }}</code>
              </dd>
            </div>
            <div>
              <dt>{{ setupCopy.steps.address.exampleApp }}</dt>
              <dd>
                <code>http://{{ preview.app }}</code>
              </dd>
            </div>
          </dl>
          <p class="hg-muted">{{ setupCopy.steps.address.publicNote }}</p>
          <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
          <BaseButton
            type="submit"
            variant="primary"
            :loading="busy"
            :label="setupCopy.steps.address.action"
          />
        </form>
      </section>

      <section v-else-if="step === 2" class="hg-setup-panel" aria-labelledby="step-title">
        <h2 id="step-title" tabindex="-1">{{ setupCopy.steps.github.title }}</h2>
        <p class="hg-muted">{{ setupCopy.steps.github.body }}</p>
        <p>
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener"
          >
            {{ setupCopy.steps.github.createLink }}
            <BaseIcon name="external" :size="14" />
          </a>
        </p>
        <form class="hg-setup-form" @submit.prevent="connectGithub">
          <BaseField :label="setupCopy.steps.github.tokenLabel" for="setup-github">
            <BasePassword id="setup-github" v-model="githubToken" autocomplete="off" />
          </BaseField>
          <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
          <div class="hg-setup-actions">
            <BaseButton
              type="submit"
              variant="primary"
              icon="github"
              :loading="busy"
              :disabled="!githubToken.trim()"
              :label="setupCopy.steps.github.action"
            />
            <BaseButton variant="ghost" :label="setupCopy.steps.github.skip" @click="step = 3" />
          </div>
        </form>
      </section>

      <section v-else class="hg-setup-panel" aria-labelledby="step-title">
        <h2 id="step-title" tabindex="-1">{{ setupCopy.steps.testFlight.title }}</h2>
        <p class="hg-muted">{{ setupCopy.steps.testFlight.body }}</p>
        <BaseMessage v-if="githubLogin" tone="success">{{
          setupCopy.steps.github.connectedAs(githubLogin)
        }}</BaseMessage>
        <div v-if="flightDeployment" class="hg-flight" aria-live="polite">
          <StatusBadge :status="flightDeployment.status" />
          <p>{{ statusCopy[flightDeployment.status].meaning }}.</p>
          <RouterLink :to="{ name: 'deployment', params: { id: flightDeployment.id } }">{{
            setupCopy.steps.testFlight.watchLog
          }}</RouterLink>
          <p v-if="flightDeployment.status === 'ready' && flightUrl">
            {{ setupCopy.steps.testFlight.openIt }}
            <a :href="flightUrl" target="_blank" rel="noopener">{{ flightUrl }}</a>
          </p>
        </div>
        <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>
        <div class="hg-setup-actions">
          <BaseButton
            v-if="!flightDeployment"
            variant="primary"
            icon="rocket"
            :loading="busy"
            :label="setupCopy.steps.testFlight.action"
            @click="takeTestFlight"
          />
          <BaseButton
            :variant="flightDeployment?.status === 'ready' ? 'primary' : 'ghost'"
            :label="
              flightDeployment ? setupCopy.steps.testFlight.done : setupCopy.steps.testFlight.skip
            "
            @click="finish"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.hg-setup {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(16rem, 24rem) minmax(0, 1fr);
}
.hg-setup-aside {
  display: grid;
  align-content: start;
  gap: var(--hg-space-4);
  padding: var(--hg-space-7) var(--hg-space-6);
  background: var(--hg-panel);
  border-right: 1px solid var(--hg-line);
}
.hg-setup-aside h1 {
  font-size: var(--hg-size-xl);
  margin-top: var(--hg-space-5);
}
.hg-setup-steps {
  list-style: none;
  margin: var(--hg-space-4) 0 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-1);
  position: relative;
}
.hg-setup-steps li {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  padding: var(--hg-space-2) 0;
  color: var(--hg-ink-muted);
}
.hg-setup-steps li.is-current {
  color: var(--hg-ink);
  font-weight: var(--hg-weight-medium);
}
.hg-setup-marker {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 1px solid var(--hg-line);
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-bold);
}
.is-current .hg-setup-marker {
  border-color: var(--hg-accent);
  color: var(--hg-accent);
}
.is-done .hg-setup-marker {
  background: var(--hg-accent);
  border-color: var(--hg-accent);
  color: var(--hg-on-accent);
}
.hg-setup-main {
  padding: var(--hg-space-7) var(--hg-space-6);
}
.hg-setup-panel {
  max-width: var(--hg-width-narrow);
  display: grid;
  gap: var(--hg-space-4);
}
.hg-setup-form {
  display: grid;
  gap: var(--hg-space-5);
  margin-top: var(--hg-space-2);
}
.hg-setup-form > .hg-button {
  justify-self: start;
}
.hg-setup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2);
}
.hg-setup-preview {
  margin: 0;
  display: grid;
  gap: var(--hg-space-3);
  padding: var(--hg-space-4);
  border-radius: var(--hg-radius-md);
  background: var(--hg-raised);
}
.hg-setup-preview dt {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-setup-preview dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.hg-flight {
  display: grid;
  gap: var(--hg-space-2);
  justify-items: start;
  padding: var(--hg-space-4);
  border-radius: var(--hg-radius-md);
  border: 1px solid var(--hg-line);
}
@media (max-width: 48rem) {
  .hg-setup {
    grid-template-columns: 1fr;
  }
  .hg-setup-aside {
    padding: var(--hg-space-5) var(--hg-space-4);
    border-right: 0;
    border-bottom: 1px solid var(--hg-line);
  }
  .hg-setup-aside h1 {
    margin-top: var(--hg-space-2);
  }
  .hg-setup-steps {
    grid-auto-flow: column;
    overflow-x: auto;
  }
  .hg-setup-steps li > span:last-child {
    display: none;
  }
  .hg-setup-steps li.is-current > span:last-child {
    display: inline;
  }
  .hg-setup-main {
    padding: var(--hg-space-5) var(--hg-space-4);
  }
}
</style>
