<script setup lang="ts">
import { navCopy, type SettingsView, toastCopy } from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { formatBytes } from '../lib/format.ts'
import { type ThemePreference, useTheme } from '../theme/useTheme.ts'
import {
  BaseButton,
  BaseField,
  BaseInput,
  BaseMessage,
  BasePassword,
  BaseSegmented,
  BaseSkeleton,
  BaseSwitch,
  useNotify,
} from '../ui/index.ts'

useDocumentTitle(navCopy.settings)
const notify = useNotify()
const theme = useTheme()

const settings = ref<SettingsView | null>(null)
const info = ref<{ version: string; imageDiskBytes: number } | null>(null)
const lanIp = ref('')
const publicDomain = ref('')
const exposeTower = ref(false)
const githubToken = ref('')
const githubLogin = ref<string | null>(null)
const tunnelToken = ref('')
const busy = ref<string | null>(null)
const errors = ref<Record<string, string | null>>({})

function apply(next: SettingsView) {
  settings.value = next
  lanIp.value = next.lanIp ?? ''
  publicDomain.value = next.publicDomain ?? ''
  exposeTower.value = next.exposeTowerPublicly
}

onMounted(async () => {
  apply(await api('getSettings'))
  info.value = await api('systemInfo').catch(() => null)
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

const saveAddress = () =>
  act('address', async () =>
    apply(await api('updateSettings', { body: { lanIp: lanIp.value.trim() } })),
  )

const savePublic = () =>
  act('public', async () =>
    apply(
      await api('updateSettings', {
        body: {
          publicDomain: publicDomain.value.trim() || null,
          exposeTowerPublicly: exposeTower.value,
        },
      }),
    ),
  )

const saveTunnel = (token: string | null) =>
  act('tunnel', async () => {
    apply(await api('setTunnelToken', { body: { token } }))
    tunnelToken.value = ''
  })

const saveGithub = (token: string | null) =>
  act('github', async () => {
    const account = await api('setGithubToken', { body: { token } })
    githubLogin.value = account.login
    githubToken.value = ''
    apply(await api('getSettings'))
  })

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
  <PageHeader :title="navCopy.settings" />

  <div v-if="!settings" class="hg-settings-loading">
    <BaseSkeleton height="10rem" />
    <BaseSkeleton height="10rem" />
  </div>

  <div v-else class="hg-settings-page">
    <HgPanel
      title="Address"
      description="Devices on your network reach Hangar and its apps through this address."
    >
      <form class="hg-form" @submit.prevent="saveAddress">
        <BaseField
          label="Server address"
          for="set-ip"
          help="Change this if the server's IP address changes; every app address updates with it."
        >
          <BaseInput id="set-ip" v-model="lanIp" mono inputmode="numeric" />
        </BaseField>
        <p v-if="settings.towerUrl" class="hg-muted hg-note">
          Control Tower: <a :href="settings.towerUrl">{{ settings.towerUrl }}</a>
        </p>
        <BaseMessage v-if="errors.address" tone="error">{{ errors.address }}</BaseMessage>
        <div>
          <BaseButton
            type="submit"
            variant="primary"
            label="Save address"
            :loading="busy === 'address'"
          />
        </div>
      </form>
    </HgPanel>

    <HgPanel
      title="GitHub"
      description="Needed only for private repositories and for picking repositories from a list."
    >
      <div class="hg-form">
        <p v-if="settings.githubConnected" class="hg-connected">
          Connected{{ githubLogin ? ` as ${githubLogin}` : '' }}.
        </p>
        <BaseField
          :label="settings.githubConnected ? 'Replace token' : 'Token'"
          for="set-github"
          help="A fine-grained token with read access to Contents and Metadata."
        >
          <BasePassword id="set-github" v-model="githubToken" autocomplete="off" />
        </BaseField>
        <BaseMessage v-if="errors.github" tone="error">{{ errors.github }}</BaseMessage>
        <div class="hg-actions">
          <BaseButton
            variant="primary"
            icon="github"
            label="Connect"
            :disabled="!githubToken.trim()"
            :loading="busy === 'github'"
            @click="saveGithub(githubToken.trim())"
          />
          <BaseButton
            v-if="settings.githubConnected"
            variant="ghost"
            label="Disconnect"
            @click="saveGithub(null)"
          />
        </div>
      </div>
    </HgPanel>

    <HgPanel
      title="Public access"
      description="Optional. Serve apps on your own domain through a Cloudflare Tunnel, with no router changes."
    >
      <div class="hg-form">
        <ol class="hg-steps">
          <li>
            In the Cloudflare dashboard, open Zero Trust, then Networks, then Tunnels, and create a
            tunnel.
          </li>
          <li>
            Add a public hostname <code>*.your-domain.com</code> with the service
            <code>http://hangar-proxy:8081</code>.
          </li>
          <li>Copy the tunnel token and paste it below, with your domain.</li>
        </ol>
        <BaseField
          label="Public domain"
          for="set-domain"
          help="Like example.com. Apps appear at name.example.com."
        >
          <BaseInput id="set-domain" v-model="publicDomain" mono placeholder="example.com" />
        </BaseField>
        <div class="hg-switch-row">
          <BaseSwitch id="set-expose" v-model="exposeTower" :disabled="!publicDomain.trim()" />
          <label for="set-expose">
            Also make the Control Tower public
            <span class="hg-muted hg-switch-help"
              >Off is safer: the Control Tower controls the whole server. Keep it on your network
              unless you need it elsewhere.</span
            >
          </label>
        </div>
        <BaseMessage v-if="errors.public" tone="error">{{ errors.public }}</BaseMessage>
        <div>
          <BaseButton
            variant="primary"
            label="Save domain"
            :loading="busy === 'public'"
            @click="savePublic"
          />
        </div>

        <BaseField
          :label="settings.tunnelConfigured ? 'Replace tunnel token' : 'Tunnel token'"
          for="set-tunnel"
        >
          <BasePassword id="set-tunnel" v-model="tunnelToken" autocomplete="off" />
        </BaseField>
        <p class="hg-muted hg-note">
          {{
            settings.tunnelConfigured
              ? 'The tunnel is configured and running.'
              : 'No tunnel yet. Apps are reachable on your network only.'
          }}
        </p>
        <BaseMessage v-if="errors.tunnel" tone="error">{{ errors.tunnel }}</BaseMessage>
        <div class="hg-actions">
          <BaseButton
            variant="primary"
            label="Save token"
            :disabled="!tunnelToken.trim()"
            :loading="busy === 'tunnel'"
            @click="saveTunnel(tunnelToken.trim())"
          />
          <BaseButton
            v-if="settings.tunnelConfigured"
            variant="ghost"
            label="Remove tunnel"
            @click="saveTunnel(null)"
          />
        </div>
      </div>
    </HgPanel>

    <HgPanel title="Appearance">
      <BaseSegmented v-model="themeChoice" :options="themeOptions" label="Color theme" />
    </HgPanel>

    <HgPanel v-if="info" title="System">
      <dl class="hg-system">
        <div>
          <dt>Version</dt>
          <dd>{{ info.version }}</dd>
        </div>
        <div>
          <dt>App images on disk</dt>
          <dd>{{ formatBytes(info.imageDiskBytes) }}</dd>
        </div>
      </dl>
    </HgPanel>
  </div>
</template>

<style scoped>
.hg-settings-page,
.hg-settings-loading {
  display: grid;
  gap: var(--hg-space-5);
  max-width: 48rem;
}
.hg-form {
  display: grid;
  gap: var(--hg-space-4);
}
.hg-note {
  font-size: var(--hg-size-sm);
}
.hg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2);
}
.hg-connected {
  color: var(--hg-status-ready);
  font-weight: var(--hg-weight-medium);
}
.hg-steps {
  margin: 0;
  padding-left: 1.25rem;
  display: grid;
  gap: var(--hg-space-2);
  font-size: var(--hg-size-sm);
}
.hg-switch-row {
  display: flex;
  gap: var(--hg-space-3);
  align-items: flex-start;
}
.hg-switch-row label {
  display: grid;
  gap: var(--hg-space-1);
}
.hg-switch-help {
  font-size: var(--hg-size-sm);
}
.hg-system {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--hg-space-4);
}
.hg-system dt {
  color: var(--hg-ink-muted);
  font-size: var(--hg-size-xs);
}
.hg-system dd {
  margin: var(--hg-space-1) 0 0;
}
</style>
