<script setup lang="ts">
import { navCopy } from '@hangar/shared'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '../brand/BrandMark.vue'
import { useLiveStore } from '../stores/live.ts'
import { useSessionStore } from '../stores/session.ts'
import { type ThemePreference, useTheme } from '../theme/useTheme.ts'
import { BaseButton, type IconName } from '../ui/index.ts'
import TourOverlay from './TourOverlay.vue'

const session = useSessionStore()
const live = useLiveStore()
const router = useRouter()
const route = useRoute()
/** Project and deployment pages belong under Projects in the navigation. */
const inProjects = computed(() =>
  ['project', 'deployment', 'new-project'].includes(String(route.name)),
)
const theme = useTheme()

const themes: { value: ThemePreference; icon: IconName; label: string }[] = [
  { value: 'dark', icon: 'moon', label: 'Theme: dark' },
  { value: 'light', icon: 'sun', label: 'Theme: light' },
  { value: 'system', icon: 'monitor', label: 'Theme: match system' },
]
const currentTheme = computed(
  () => themes.find((t) => t.value === theme.preference.value) ?? themes[0]!,
)
function cycleTheme() {
  const index = themes.findIndex((t) => t.value === theme.preference.value)
  theme.setPreference(themes[(index + 1) % themes.length]!.value)
}

async function signOut() {
  live.disconnect()
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <a class="hg-skip" href="#main">Skip to content</a>
  <header class="hg-shell-header">
    <div class="hg-shell-bar">
      <RouterLink :to="{ name: 'home' }" class="hg-shell-brand" aria-label="Hangar home">
        <BrandMark />
      </RouterLink>
      <nav class="hg-shell-nav" aria-label="Main">
        <RouterLink :to="{ name: 'home' }" :class="{ 'is-section': inProjects }">{{
          navCopy.projects
        }}</RouterLink>
        <RouterLink :to="{ name: 'settings' }">{{ navCopy.settings }}</RouterLink>
        <RouterLink :to="{ name: 'guide' }" data-tour="guide">{{ navCopy.guide }}</RouterLink>
      </nav>
      <div class="hg-shell-tools">
        <span
          v-hint.bottom="live.connected ? 'Live updates connected' : 'Reconnecting to live updates'"
          class="hg-shell-link"
          :class="{ 'is-up': live.connected }"
          role="status"
          :aria-label="live.connected ? 'Live updates connected' : 'Reconnecting to live updates'"
        />
        <BaseButton
          v-hint.bottom="currentTheme.label"
          variant="ghost"
          size="sm"
          :icon="currentTheme.icon"
          :aria-label="currentTheme.label"
          @click="cycleTheme"
        />
        <span class="hg-shell-user hg-muted">{{ session.username }}</span>
        <BaseButton
          v-hint.bottom="navCopy.signOut"
          variant="ghost"
          size="sm"
          icon="logout"
          :aria-label="navCopy.signOut"
          @click="signOut"
        />
      </div>
    </div>
  </header>
  <main id="main" class="hg-shell-main" tabindex="-1">
    <slot />
  </main>
  <TourOverlay />
</template>

<style scoped>
.hg-skip {
  position: absolute;
  left: var(--hg-space-3);
  top: -3rem;
  z-index: 10;
  padding: var(--hg-space-2) var(--hg-space-3);
  background: var(--hg-accent-fill);
  color: var(--hg-on-accent);
  border-radius: var(--hg-radius-md);
}
.hg-skip:focus {
  top: var(--hg-space-3);
}
.hg-shell-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: color-mix(in srgb, var(--hg-canvas) 90%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--hg-line);
}
.hg-shell-bar {
  max-width: var(--hg-width-wide);
  margin: 0 auto;
  padding: 0 var(--hg-space-5);
  height: 3.5rem;
  display: flex;
  align-items: center;
  gap: var(--hg-space-6);
}
.hg-shell-brand {
  text-decoration: none;
}
.hg-shell-nav {
  display: flex;
  align-self: stretch;
  gap: var(--hg-space-5);
  flex: 1;
}
/* The current page sits on the magenta line; hovering draws it in. */
.hg-shell-nav a {
  position: relative;
  display: flex;
  align-items: center;
  color: var(--hg-ink-muted);
  text-decoration: none;
  transition: color var(--hg-motion-fast) var(--hg-motion-easing);
}
.hg-shell-nav a::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--hg-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--hg-motion-base) var(--hg-motion-easing);
}
.hg-shell-nav a:hover {
  color: var(--hg-ink);
}
.hg-shell-nav a:hover::after {
  transform: scaleX(0.35);
}
.hg-shell-nav a.router-link-exact-active,
.hg-shell-nav a.is-section {
  color: var(--hg-ink);
}
.hg-shell-nav a.router-link-exact-active::after,
.hg-shell-nav a.is-section::after {
  transform: scaleX(1);
}
.hg-shell-tools {
  display: flex;
  align-items: center;
  gap: var(--hg-space-1);
}
.hg-shell-link {
  width: 0.45rem;
  height: 0.45rem;
  margin: 0 var(--hg-space-2);
  border-radius: 50%;
  background: var(--hg-status-building);
}
.hg-shell-link.is-up {
  background: var(--hg-status-ready);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--hg-status-ready) 18%, transparent);
}
.hg-shell-user {
  font-size: var(--hg-size-sm);
  padding: 0 var(--hg-space-2);
}
.hg-shell-main {
  max-width: var(--hg-width-wide);
  margin: 0 auto;
  padding: var(--hg-space-6) var(--hg-space-5) var(--hg-space-7);
  outline: none;
}
@media (max-width: 44rem) {
  .hg-shell-bar {
    flex-wrap: wrap;
    height: auto;
    gap: 0 var(--hg-space-2);
    padding: var(--hg-space-2) var(--hg-space-4) 0;
  }
  .hg-shell-tools {
    margin-left: auto;
  }
  .hg-shell-user {
    display: none;
  }
  .hg-shell-nav {
    order: 3;
    flex-basis: 100%;
    height: 2.5rem;
    overflow-x: auto;
  }
  .hg-shell-main {
    padding: var(--hg-space-5) var(--hg-space-4) var(--hg-space-7);
  }
}
</style>
