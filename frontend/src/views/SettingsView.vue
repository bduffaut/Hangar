<script setup lang="ts">
import {
  type AddressCheckResult,
  brand,
  navCopy,
  type SettingsView,
  type SystemInfo,
  toastCopy,
  TUNNEL_SERVICE_URL,
} from '@hangar/shared'
import { computed, onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import CopyField from '../components/CopyField.vue'
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
const info = ref<SystemInfo | null>(null)
const lanIp = ref('')
const newDomain = ref('')
const exposeTower = ref(false)
const githubToken = ref('')
const githubLogin = ref<string | null>(null)
const tunnelToken = ref('')
const busy = ref<string | null>(null)
const errors = ref<Record<string, string | null>>({})

function apply(next: SettingsView) {
  settings.value = next
  lanIp.value = next.lanIp ?? ''
  exposeTower.value = next.exposeTowerPublicly
}

const loadError = ref('')
async function load() {
  loadError.value = ''
  try {
    apply(await api('getSettings'))
  } catch (e) {
    loadError.value = messageOf(e)
    return
  }
  info.value = await api('systemInfo').catch(() => null)
}
onMounted(load)

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

// Domains save as a whole list; the first is the default.
const saveDomains = (publicDomains: string[], key = 'domains') =>
  act(key, async () => {
    apply(await api('updateSettings', { body: { publicDomains } }))
  })
async function addDomain() {
  const domain = newDomain.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^\*\./, '')
    .replace(/[/.]+$/, '')
  if (!domain || !settings.value) return
  await saveDomains([...settings.value.publicDomains, domain], 'add-domain')
  if (!errors.value['add-domain']) newDomain.value = ''
}
const removeDomain = (domain: string) =>
  saveDomains(
    settings.value!.publicDomains.filter((d) => d !== domain),
    `domain:${domain}`,
  )
const makeDefault = (domain: string) =>
  saveDomains(
    [domain, ...settings.value!.publicDomains.filter((d) => d !== domain)],
    `domain:${domain}`,
  )

const defaultDomain = computed(() => settings.value?.defaultDomain ?? null)
const saveExposeTower = () =>
  act('expose', async () =>
    apply(await api('updateSettings', { body: { exposeTowerPublicly: exposeTower.value } })),
  )

// Check that names under a domain reach this Hangar through the tunnel.
const checks = ref<Record<string, AddressCheckResult | 'checking'>>({})
async function checkDomain(domain: string) {
  checks.value = { ...checks.value, [domain]: 'checking' }
  try {
    checks.value = {
      ...checks.value,
      [domain]: await api('checkAddress', { body: { hostname: domain, wildcard: true } }),
    }
  } catch (e) {
    checks.value = { ...checks.value, [domain]: { status: 'unreachable', message: messageOf(e) } }
  }
}
const checkOf = (domain: string) => {
  const check = checks.value[domain]
  return check && check !== 'checking' ? check : null
}

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

  <div v-if="loadError" class="hg-settings-loading">
    <BaseMessage tone="error">{{ loadError }}</BaseMessage>
    <div><BaseButton icon="restart" label="Try again" @click="load" /></div>
  </div>

  <div v-else-if="!settings" class="hg-settings-loading">
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
          help="Change this if the server's IP address changes. Every app address updates with it."
        >
          <BaseInput id="set-ip" v-model="lanIp" mono inputmode="numeric" />
        </BaseField>
        <p v-if="settings.towerUrl" class="hg-muted hg-note">
          {{ brand.dashboardName }}: <a :href="settings.towerUrl">{{ settings.towerUrl }}</a>
        </p>
        <p class="hg-muted hg-note">
          Lost access after changing it? On the server, run
          <code class="hg-nowrap">sudo hangar-admin set-lan-ip &lt;address&gt;</code>.
        </p>
        <BaseMessage v-if="errors.address" tone="error">{{ errors.address }}</BaseMessage>
        <div>
          <BaseButton
            type="submit"
            variant="primary"
            label="Save address"
            :loading="busy === 'address'"
            :disabled="busy !== null"
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
            :disabled="!githubToken.trim() || busy !== null"
            :loading="busy === 'github'"
            @click="saveGithub(githubToken.trim())"
          />
          <BaseButton
            v-if="settings.githubConnected"
            variant="ghost"
            label="Disconnect"
            :disabled="busy !== null"
            @click="saveGithub(null)"
          />
        </div>
      </div>
    </HgPanel>

    <HgPanel
      id="public-access"
      title="Public access"
      description="Optional. Put apps on your own domains through a Cloudflare Tunnel: no open ports, and your home address stays hidden."
    >
      <div class="hg-public">
        <section class="hg-public-step" aria-labelledby="pa-tunnel">
          <h3 id="pa-tunnel">
            1. Connect a tunnel
            <span class="hg-pill" :class="settings.tunnelConfigured ? 'is-on' : 'is-off'">{{
              settings.tunnelConfigured ? 'Connected' : 'Not set up'
            }}</span>
          </h3>
          <ol v-if="!settings.tunnelConfigured" class="hg-steps">
            <li>
              In the Cloudflare dashboard, open Zero Trust, then Networks, then Tunnels, and create
              a tunnel of type Cloudflared. Name it something like <code>hangar</code>.
            </li>
            <li>
              Copy the token from the install command Cloudflare shows (the long text after
              <code>--token</code>). You do not need to install anything: Hangar runs the tunnel.
            </li>
          </ol>
          <p v-else class="hg-muted hg-note">
            Hangar runs the tunnel for you. It is separate from any other tunnel on this machine.
          </p>
          <BaseField
            :label="settings.tunnelConfigured ? 'Replace tunnel token' : 'Tunnel token'"
            for="set-tunnel"
          >
            <BasePassword id="set-tunnel" v-model="tunnelToken" autocomplete="off" />
          </BaseField>
          <BaseMessage v-if="errors.tunnel" tone="error">{{ errors.tunnel }}</BaseMessage>
          <div class="hg-actions">
            <BaseButton
              :variant="settings.tunnelConfigured ? 'secondary' : 'primary'"
              label="Save token"
              :disabled="!tunnelToken.trim() || busy !== null"
              :loading="busy === 'tunnel'"
              @click="saveTunnel(tunnelToken.trim())"
            />
            <BaseButton
              v-if="settings.tunnelConfigured"
              variant="ghost"
              label="Remove tunnel"
              :disabled="busy !== null"
              @click="saveTunnel(null)"
            />
          </div>
        </section>

        <section class="hg-public-step" aria-labelledby="pa-domains">
          <h3 id="pa-domains">2. Add your domains</h3>
          <p class="hg-muted hg-note">
            Any domain on your Cloudflare account. The default is suggested for new projects; each
            project chooses its own addresses on any of them.
          </p>
          <ul v-if="settings.publicDomains.length" class="hg-domain-list">
            <li v-for="domain in settings.publicDomains" :key="domain" class="hg-domain">
              <div class="hg-domain-head">
                <code class="hg-domain-name">{{ domain }}</code>
                <span v-if="domain === settings.defaultDomain" class="hg-pill is-on">Default</span>
                <span class="hg-domain-actions">
                  <BaseButton
                    v-hint.top="'Check that names under this domain reach Hangar'"
                    size="sm"
                    variant="ghost"
                    icon="globe"
                    label="Check"
                    :loading="checks[domain] === 'checking'"
                    :disabled="busy !== null"
                    @click="checkDomain(domain)"
                  />
                  <BaseButton
                    v-if="domain !== settings.defaultDomain"
                    size="sm"
                    variant="ghost"
                    label="Make default"
                    :disabled="busy !== null"
                    @click="makeDefault(domain)"
                  />
                  <BaseButton
                    size="sm"
                    variant="ghost"
                    icon="x"
                    :aria-label="`Remove ${domain}`"
                    :disabled="busy !== null"
                    @click="removeDomain(domain)"
                  />
                </span>
              </div>
              <div class="hg-domain-how">
                <p>
                  In Hangar's tunnel, add a public hostname with subdomain <code>*</code>, domain
                  <code>{{ domain }}</code
                  >, and this service:
                </p>
                <CopyField :value="TUNNEL_SERVICE_URL" label="service" />
              </div>
              <p
                v-if="checkOf(domain)"
                class="hg-domain-check"
                :class="`is-${checkOf(domain)!.status}`"
                role="status"
              >
                {{ checkOf(domain)!.message }}
              </p>
              <BaseMessage v-if="errors[`domain:${domain}`]" tone="error">{{
                errors[`domain:${domain}`]
              }}</BaseMessage>
            </li>
          </ul>
          <form class="hg-domain-add" @submit.prevent="addDomain">
            <BaseField
              label="Add a domain"
              for="set-domain"
              help="Like example.com, without https:// or a name in front."
            >
              <BaseInput id="set-domain" v-model="newDomain" mono placeholder="example.com" />
            </BaseField>
            <div>
              <BaseButton
                type="submit"
                icon="plus"
                label="Add domain"
                :disabled="!newDomain.trim() || busy !== null"
                :loading="busy === 'add-domain'"
              />
            </div>
          </form>
          <BaseMessage v-if="errors['add-domain']" tone="error">{{
            errors['add-domain']
          }}</BaseMessage>
        </section>

        <section class="hg-public-step" aria-labelledby="pa-options">
          <h3 id="pa-options">3. Options</h3>
          <p v-if="defaultDomain" class="hg-muted hg-note">
            GitHub webhooks arrive at <code>hooks.{{ defaultDomain }}</code
            >, so pushes deploy instantly instead of within a minute.
          </p>
          <div class="hg-switch-row">
            <BaseSwitch
              id="set-expose"
              v-model="exposeTower"
              :disabled="!defaultDomain || busy !== null"
              @update:model-value="saveExposeTower"
            />
            <label for="set-expose">
              Make the {{ brand.dashboardName }} public{{
                defaultDomain ? ` at tower.${defaultDomain}` : ''
              }}
              <span class="hg-muted hg-switch-help"
                >Off is safer: the {{ brand.dashboardName }} controls the whole server. Keep it on
                your network unless you need it elsewhere.</span
              >
            </label>
          </div>
          <BaseMessage v-if="errors.expose" tone="error">{{ errors.expose }}</BaseMessage>
        </section>
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
  font-weight: var(--hg-weight-regular);
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
.hg-public {
  display: grid;
  gap: var(--hg-space-6);
}
.hg-public-step {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-public-step h3 {
  display: flex;
  align-items: center;
  gap: var(--hg-space-3);
  font-size: var(--hg-size-md);
}
.hg-pill {
  padding: 0.1rem 0.5rem;
  border-radius: var(--hg-radius-sm);
  font-size: var(--hg-size-xs);
  font-weight: var(--hg-weight-regular);
  letter-spacing: 0;
}
.hg-pill.is-on {
  background: color-mix(in srgb, var(--hg-status-ready) 16%, transparent);
  color: var(--hg-ink);
}
.hg-pill.is-off {
  background: var(--hg-raised);
  color: var(--hg-ink-muted);
}
.hg-domain-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-2);
}
.hg-domain {
  display: grid;
  gap: var(--hg-space-2);
  padding: var(--hg-space-3);
  border: 1px solid var(--hg-line);
  border-left: 3px solid var(--hg-accent);
  border-radius: var(--hg-radius-md);
}
.hg-domain-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-2);
}
.hg-domain-name {
  font-size: var(--hg-size-md);
}
.hg-domain-actions {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-1);
}
.hg-domain-how {
  display: grid;
  gap: var(--hg-space-2);
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-domain-check {
  font-size: var(--hg-size-sm);
  color: var(--hg-caution);
}
.hg-domain-check.is-ok {
  color: var(--hg-status-ready);
}
.hg-domain-add {
  display: grid;
  gap: var(--hg-space-3);
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
