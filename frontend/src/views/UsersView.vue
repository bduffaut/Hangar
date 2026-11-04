<script setup lang="ts">
import { type InviteView, navCopy, type UserRole, type UserView, usersCopy } from '@hangar/shared'
import { onMounted, ref } from 'vue'
import { api, messageOf } from '../api/client.ts'
import CopyField from '../components/CopyField.vue'
import HgPanel from '../components/HgPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useSessionStore } from '../stores/session.ts'
import {
  BaseButton,
  BaseField,
  BaseInput,
  BaseMessage,
  BaseSelect,
  BaseSkeleton,
  useConfirmAction,
  useNotify,
} from '../ui/index.ts'

useDocumentTitle(navCopy.users)
const session = useSessionStore()
const notify = useNotify()
const confirm = useConfirmAction()

const users = ref<UserView[] | null>(null)
const invites = ref<InviteView[]>([])
const inviteRole = ref<UserRole>('member')
const inviteLabel = ref('')
const created = ref<{ url: string; note: string } | null>(null)
const busy = ref<string | null>(null)
const error = ref<string | null>(null)

const roleOptions = (Object.keys(usersCopy.roles) as UserRole[]).map((value) => ({
  label: usersCopy.roles[value],
  value,
}))

/** The token goes after the #, so opening the link never sends it to a server. */
const linkFor = (token: string) => `${window.location.origin}/invite#${token}`

async function load() {
  ;[users.value, invites.value] = await Promise.all([api('listUsers'), api('listInvites')])
}
onMounted(() => load().catch((e: unknown) => (error.value = messageOf(e))))

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

const createInvite = () =>
  act('invite', async () => {
    const { token } = await api('createInvite', {
      body: { role: inviteRole.value, label: inviteLabel.value || undefined },
    })
    created.value = { url: linkFor(token), note: usersCopy.inviteReady }
    inviteLabel.value = ''
    await load()
  })

const revoke = (invite: InviteView) =>
  act(`invite:${invite.id}`, async () => {
    await api('revokeInvite', { params: { id: invite.id } })
    await load()
  })

const setRole = (user: UserView, role: UserRole) =>
  act(`role:${user.id}`, async () => {
    await api('updateUser', { params: { id: user.id }, body: { role } })
    await load()
  }).then(() => {
    if (error.value) void load()
  })

const resetLink = (user: UserView) =>
  act(`reset:${user.id}`, async () => {
    const { token } = await api('createResetLink', { params: { id: user.id } })
    created.value = { url: linkFor(token), note: usersCopy.resetReady(user.username) }
  })

async function remove(user: UserView) {
  const copy = usersCopy.deleteConfirm(user.username, user.projectCount)
  if (!(await confirm({ ...copy, danger: true }))) return
  await act(`delete:${user.id}`, async () => {
    await api('deleteUser', { params: { id: user.id } })
    notify.success(`${user.username} was deleted`)
    await load()
  })
}
</script>

<template>
  <PageHeader :title="usersCopy.title" :subtitle="usersCopy.subtitle" />
  <div class="hg-people">
    <BaseMessage v-if="error" tone="error">{{ error }}</BaseMessage>

    <div v-if="created" class="hg-people-link">
      <BaseMessage tone="success">{{ created.note }} {{ usersCopy.linkHint }}</BaseMessage>
      <CopyField :value="created.url" label="link" />
    </div>

    <HgPanel :title="usersCopy.accounts" :description="usersCopy.roleHelp">
      <BaseSkeleton v-if="!users" height="6rem" />
      <ul v-else class="hg-people-list">
        <li v-for="user in users" :key="user.id" :data-user="user.username">
          <div class="hg-people-who">
            <strong>{{ user.username }}</strong>
            <span class="hg-muted">{{ usersCopy.projects(user.projectCount) }}</span>
          </div>
          <div class="hg-people-actions">
            <BaseSelect
              :id="`role-${user.id}`"
              :model-value="user.role"
              :options="roleOptions"
              :aria-label="`Role of ${user.username}`"
              :disabled="busy !== null"
              @update:model-value="(role) => role && setRole(user, role as UserRole)"
            />
            <template v-if="user.id !== session.session?.user.id">
              <BaseButton
                size="sm"
                variant="ghost"
                :label="usersCopy.resetPassword"
                :disabled="busy !== null"
                @click="resetLink(user)"
              />
              <BaseButton
                size="sm"
                variant="ghost"
                icon="x"
                :aria-label="`Delete ${user.username}`"
                :disabled="busy !== null"
                @click="remove(user)"
              />
            </template>
          </div>
        </li>
      </ul>
    </HgPanel>

    <HgPanel :title="usersCopy.invites" :description="usersCopy.inviteDescription">
      <div class="hg-people-invites">
        <ul v-if="invites.length" class="hg-people-list">
          <li v-for="invite in invites" :key="invite.id">
            <div class="hg-people-who">
              <strong>{{ invite.label ?? 'Unnamed invite' }}</strong>
              <span class="hg-muted">
                {{ usersCopy.roles[invite.role] }}, until
                {{ new Date(invite.expiresAt).toLocaleDateString() }}
              </span>
            </div>
            <BaseButton
              size="sm"
              variant="ghost"
              label="Revoke"
              :disabled="busy !== null"
              @click="revoke(invite)"
            />
          </li>
        </ul>
        <p v-else class="hg-muted">{{ usersCopy.noInvites }}</p>
        <form class="hg-people-form" @submit.prevent="createInvite">
          <BaseField :label="usersCopy.inviteLabel" for="invite-label">
            <BaseInput id="invite-label" v-model="inviteLabel" />
          </BaseField>
          <BaseField label="Role" for="invite-role">
            <BaseSelect id="invite-role" v-model="inviteRole" :options="roleOptions" />
          </BaseField>
          <div>
            <BaseButton
              type="submit"
              variant="primary"
              icon="plus"
              :label="usersCopy.invite"
              :loading="busy === 'invite'"
              :disabled="busy !== null"
            />
          </div>
        </form>
      </div>
    </HgPanel>
  </div>
</template>

<style scoped>
.hg-people {
  display: grid;
  gap: var(--hg-space-5);
  max-width: 48rem;
}
.hg-people-link,
.hg-people-invites,
.hg-people-form {
  display: grid;
  gap: var(--hg-space-3);
}
.hg-people-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-2);
}
.hg-people-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--hg-space-3);
  padding: var(--hg-space-3);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-md);
}
.hg-people-who {
  display: grid;
}
.hg-people-who strong {
  font-weight: var(--hg-weight-regular);
}
.hg-people-who .hg-muted {
  font-size: var(--hg-size-sm);
}
.hg-people-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--hg-space-2);
}
</style>
