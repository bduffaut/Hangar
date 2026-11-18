<script setup lang="ts">
import { landingCopy } from '@hangar/shared'
import { marked } from 'marked'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '../brand/BrandMark.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { useClipboard } from '../composables/useClipboard.ts'

// The guides, written once in docs/guides/*.md so they read the same on GitHub and here. Links
// between guides are written as `install.md` and become /docs/install.
const files = import.meta.glob('../../../docs/guides/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** The order of the guides in the side menu; anything not listed comes after, by name. */
const ORDER = [
  'install',
  'how-it-works',
  'tailscale',
  'go-public',
  'github',
  'sharing',
  'updating',
  'troubleshooting',
  'security',
]

interface Guide {
  slug: string
  title: string
  html: string
}

const guides: Guide[] = Object.entries(files)
  .map(([path, text]) => {
    const slug = path.split('/').pop()!.replace(/\.md$/, '')
    const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? slug
    const html = marked
      .parse(text, { async: false })
      // Links between guides stay inside the site.
      .replace(/href="(?:\.\/)?([a-z0-9-]+)\.md(#[^"]*)?"/g, 'href="/docs/$1$2"')
      .replace(/href="(https?:\/\/[^"]+)"/g, 'href="$1" rel="noopener" target="_blank"')
    return { slug, title, html }
  })
  .sort((a, b) => {
    const rank = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length)
    return rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug)
  })

const route = useRoute()
const router = useRouter()
const current = computed(
  () => guides.find((g) => g.slug === route.params.slug) ?? guides[0] ?? null,
)
const title = computed(() => current.value?.title ?? 'Guides')
useDocumentTitle(title)

const body = ref<HTMLElement | null>(null)
const copy = useClipboard()

/** Internal links use the router; each code block gets a copy button. */
async function enhance() {
  await nextTick()
  const root = body.value
  if (!root) return
  for (const pre of root.querySelectorAll('pre')) {
    if (pre.querySelector('.hg-docs-copy')) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'hg-docs-copy'
    button.textContent = 'Copy'
    button.addEventListener('click', () => {
      copy(pre.querySelector('code')?.textContent?.trim() ?? '')
      button.textContent = 'Copied'
      setTimeout(() => (button.textContent = 'Copy'), 1500)
    })
    pre.append(button)
  }
}
watch(current, enhance, { immediate: true })

function follow(event: MouseEvent) {
  const link = (event.target as HTMLElement).closest('a')
  const href = link?.getAttribute('href')
  if (!link || !href?.startsWith('/') || event.metaKey || event.ctrlKey) return
  event.preventDefault()
  void router.push(href)
}
</script>

<template>
  <div class="hg-docs">
    <header class="hg-docs-bar">
      <RouterLink :to="{ name: 'welcome' }" aria-label="Hangar home"><BrandMark /></RouterLink>
      <nav class="hg-docs-top" aria-label="Site">
        <RouterLink :to="{ name: 'home' }">{{ landingCopy.tour }}</RouterLink>
        <a href="https://github.com/bduffaut/Hangar" rel="noopener">GitHub</a>
      </nav>
    </header>
    <div class="hg-docs-layout">
      <nav class="hg-docs-nav" aria-label="Guides">
        <RouterLink
          v-for="guide in guides"
          :key="guide.slug"
          :to="{ name: 'docs', params: { slug: guide.slug } }"
          :class="{ 'is-active': current?.slug === guide.slug }"
          :aria-current="current?.slug === guide.slug ? 'page' : undefined"
          >{{ guide.title }}</RouterLink
        >
      </nav>
      <!-- The guides are this repository's own Markdown files, built into the site. -->
      <!-- eslint-disable vue/no-v-html -->
      <article
        v-if="current"
        ref="body"
        class="hg-docs-body"
        @click="follow"
        v-html="current.html"
      />
      <!-- eslint-enable vue/no-v-html -->
    </div>
  </div>
</template>

<style scoped>
.hg-docs {
  min-height: 100dvh;
}
.hg-docs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 72rem;
  height: 4rem;
  margin: 0 auto;
  padding: 0 var(--hg-space-5);
}
.hg-docs-top {
  display: flex;
  gap: var(--hg-space-4);
  font-size: var(--hg-size-sm);
}
.hg-docs-top a {
  color: var(--hg-ink-muted);
  text-decoration: none;
}
.hg-docs-top a:hover {
  color: var(--hg-ink);
}
.hg-docs-layout {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: var(--hg-space-6);
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--hg-space-5) var(--hg-space-5) 6rem;
}
.hg-docs-nav {
  position: sticky;
  top: var(--hg-space-5);
  align-self: start;
  display: grid;
  gap: 2px;
}
.hg-docs-nav a {
  padding: var(--hg-space-2) var(--hg-space-3);
  border-left: 2px solid var(--hg-line);
  color: var(--hg-ink-muted);
  text-decoration: none;
  font-size: var(--hg-size-sm);
}
.hg-docs-nav a:hover {
  color: var(--hg-ink);
}
.hg-docs-nav a.is-active {
  border-left-color: var(--hg-accent);
  color: var(--hg-ink);
  font-weight: var(--hg-weight-bold);
}
.hg-docs-body {
  max-width: 46rem;
  line-height: 1.7;
}
.hg-docs-body :deep(h1) {
  font-size: var(--hg-size-xxl);
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0 0 var(--hg-space-4);
}
.hg-docs-body :deep(h2) {
  font-size: var(--hg-size-xl);
  letter-spacing: -0.02em;
  margin: var(--hg-space-6) 0 var(--hg-space-3);
}
.hg-docs-body :deep(h3) {
  font-size: var(--hg-size-md);
  margin: var(--hg-space-5) 0 var(--hg-space-2);
}
.hg-docs-body :deep(p),
.hg-docs-body :deep(ul),
.hg-docs-body :deep(ol) {
  margin: 0 0 var(--hg-space-4);
}
.hg-docs-body :deep(li) {
  margin-bottom: var(--hg-space-1);
}
.hg-docs-body :deep(code) {
  font-family: var(--hg-mono);
  font-size: 0.88em;
  padding: 0.1em 0.35em;
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-radius: 4px;
}
.hg-docs-body :deep(pre) {
  position: relative;
  margin: 0 0 var(--hg-space-4);
  padding: var(--hg-space-4);
  padding-right: 5rem;
  overflow-x: auto;
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-left: 2px solid var(--hg-accent);
}
.hg-docs-body :deep(pre code) {
  padding: 0;
  background: none;
  border: 0;
  white-space: pre;
}
.hg-docs-body :deep(.hg-docs-copy) {
  position: absolute;
  top: var(--hg-space-3);
  right: var(--hg-space-3);
  padding: 2px 10px;
  font: inherit;
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
  background: var(--hg-canvas);
  border: 1px solid var(--hg-line);
  border-radius: 4px;
  cursor: pointer;
}
.hg-docs-body :deep(.hg-docs-copy:hover) {
  color: var(--hg-ink);
}
.hg-docs-body :deep(blockquote) {
  margin: 0 0 var(--hg-space-4);
  padding: var(--hg-space-3) var(--hg-space-4);
  border-left: 2px solid var(--hg-link);
  background: color-mix(in srgb, var(--hg-panel) 70%, transparent);
  color: var(--hg-ink-muted);
}
.hg-docs-body :deep(blockquote p:last-child) {
  margin: 0;
}
.hg-docs-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 var(--hg-space-4);
  font-size: var(--hg-size-sm);
}
.hg-docs-body :deep(th),
.hg-docs-body :deep(td) {
  text-align: left;
  padding: var(--hg-space-2) var(--hg-space-3);
  border-bottom: 1px solid var(--hg-line);
  vertical-align: top;
}
.hg-docs-body :deep(img) {
  max-width: 100%;
  border: 1px solid var(--hg-line);
}
@media (max-width: 52rem) {
  .hg-docs-layout {
    grid-template-columns: 1fr;
  }
  .hg-docs-nav {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: var(--hg-space-1);
  }
  .hg-docs-nav a {
    border-left: 0;
    border-bottom: 2px solid var(--hg-line);
  }
  .hg-docs-nav a.is-active {
    border-bottom-color: var(--hg-accent);
  }
}
@media (max-width: 36rem) {
  .hg-docs-bar,
  .hg-docs-layout {
    padding-left: var(--hg-space-4);
    padding-right: var(--hg-space-4);
  }
}
</style>
