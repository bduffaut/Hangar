<script setup lang="ts">
import { landingCopy } from '@hangar/shared'
import { marked } from 'marked'
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '../brand/BrandMark.vue'
import { useClipboard } from '../composables/useClipboard.ts'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { BaseIcon } from '../ui/index.ts'

// The guides, written once in docs/guides/*.md so they read the same on GitHub and here. Links
// between guides are written as `install.md` and become /docs/install.
const files = import.meta.glob('../../../docs/guides/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Pictures in the guides, written as `../images/guides/x.png` so they show on GitHub too. */
const images = import.meta.glob('../../../docs/images/guides/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>
const imageUrl = (name: string) => images[`../../../docs/images/guides/${name}`]

/** A heading's anchor, as GitHub makes it, so `apps.md#new-versions` works in both places. */
const anchor = (text: string) =>
  text
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/ /g, '-')

/** The order of the guides in the side menu; anything not listed comes after, by name. */
const ORDER = [
  'install',
  'how-it-works',
  'tailscale',
  'go-public',
  'apps',
  'apps-media',
  'apps-photos',
  'apps-documents',
  'apps-home',
  'apps-smart-home',
  'apps-games',
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
      .replace(/<img src="\.\.\/images\/guides\/([a-z0-9-]+\.png)"/g, (tag, name: string) => {
        const url = imageUrl(name)
        return url ? `<img loading="lazy" src="${url}"` : tag
      })
      .replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
        return `<h${level} id="${anchor(inner)}">${inner}</h${level}>`
      })
      // Numbered steps ("## 1. Run the installer") get the waypoint mark the front page uses.
      .replace(
        /<h2 (id="[^"]*")>(\d+)\.\s+([\s\S]*?)<\/h2>/g,
        '<h2 $1 class="hg-step"><span class="hg-step-mark" aria-hidden="true">$2</span><span><span class="hg-visually-hidden">Step $2: </span>$3</span></h2>',
      )
    return { slug, title, html }
  })
  .sort((a, b) => {
    const rank = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length)
    return rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug)
  })

const route = useRoute()
const router = useRouter()
const index = computed(() => {
  const i = guides.findIndex((g) => g.slug === route.params.slug)
  return i === -1 ? 0 : i
})
const current = computed(() => guides[index.value] ?? null)
const previous = computed(() => guides[index.value - 1] ?? null)
const next = computed(() => guides[index.value + 1] ?? null)
const title = computed(() => current.value?.title ?? 'Guides')
useDocumentTitle(title)

const copy = useClipboard({ quiet: true })
/** BaseIcon's copy glyph, as markup: these buttons are made outside Vue, in rendered Markdown. */
const COPY_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 9h11v11H9zM5 15H4V4h11v1"/></svg>'

const resizes =
  typeof ResizeObserver === 'undefined'
    ? { observe() {}, disconnect() {} }
    : new ResizeObserver((entries) => {
        for (const { target } of entries) target.dispatchEvent(new Event('scroll'))
      })
onBeforeUnmount(() => resizes.disconnect())

/**
 * Each code block gets a copy button beside it, outside the scrolling area, so the button never
 * covers the end of a long command.
 */
async function enhance() {
  await nextTick()
  const root = document.querySelector<HTMLElement>('.hg-docs-body')
  if (!root) return
  for (const pre of root.querySelectorAll('pre')) {
    if (pre.parentElement?.classList.contains('hg-docs-code')) continue
    const frame = document.createElement('div')
    frame.className = 'hg-docs-code'
    pre.replaceWith(frame)
    frame.append(pre)
    pre.tabIndex = 0
    // A fade at the right edge while there is more of the line to scroll to.
    const measure = () =>
      pre.classList.toggle('has-more', pre.scrollLeft + pre.clientWidth < pre.scrollWidth - 2)
    pre.addEventListener('scroll', measure, { passive: true })
    resizes.observe(pre)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'hg-docs-copy'
    const label = document.createElement('span')
    const say = (text: string) => {
      label.textContent = text
      button.setAttribute('aria-label', text)
    }
    say('Copy')
    button.innerHTML = COPY_ICON
    button.append(label)
    button.addEventListener('click', async () => {
      if (!(await copy(pre.querySelector('code')?.textContent?.trim() ?? ''))) return
      say('Copied')
      setTimeout(() => say('Copy'), 1800)
    })
    frame.append(button)
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

/** On phones the guide list is a menu that closes once a guide is picked. */
function closeMenu(event: Event) {
  ;(event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')
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
        <details class="hg-docs-menu">
          <summary>
            <span class="hg-muted">Guide {{ index + 1 }} of {{ guides.length }}</span>
            <span class="hg-docs-menu-title">{{ current?.title }}</span>
            <BaseIcon name="chevron" :size="16" />
          </summary>
          <div class="hg-docs-links" @click="closeMenu">
            <RouterLink
              v-for="guide in guides"
              :key="guide.slug"
              :to="{ name: 'docs', params: { slug: guide.slug } }"
              :class="{ 'is-active': current?.slug === guide.slug }"
              :aria-current="current?.slug === guide.slug ? 'page' : undefined"
              >{{ guide.title }}</RouterLink
            >
          </div>
        </details>
        <div class="hg-docs-links hg-docs-links-wide">
          <RouterLink
            v-for="guide in guides"
            :key="guide.slug"
            :to="{ name: 'docs', params: { slug: guide.slug } }"
            :class="{ 'is-active': current?.slug === guide.slug }"
            :aria-current="current?.slug === guide.slug ? 'page' : undefined"
            >{{ guide.title }}</RouterLink
          >
        </div>
      </nav>
      <main class="hg-docs-main">
        <!-- The guides are this repository's own Markdown files, built into the site. -->
        <!-- eslint-disable vue/no-v-html -->
        <article
          v-if="current"
          :key="current.slug"
          class="hg-docs-body"
          @click="follow"
          v-html="current.html"
        />
        <!-- eslint-enable vue/no-v-html -->
        <nav class="hg-docs-pager" aria-label="Previous and next guide">
          <RouterLink
            v-if="previous"
            class="hg-docs-pager-link"
            :to="{ name: 'docs', params: { slug: previous.slug } }"
          >
            <span class="hg-muted">Previous</span>
            <span>{{ previous.title }}</span>
          </RouterLink>
          <RouterLink
            v-if="next"
            class="hg-docs-pager-link is-next"
            :to="{ name: 'docs', params: { slug: next.slug } }"
          >
            <span class="hg-muted">Next</span>
            <span>{{ next.title }}</span>
          </RouterLink>
        </nav>
      </main>
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
  gap: 4rem;
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--hg-space-6) var(--hg-space-5) 6rem;
}

/* Guide list */
.hg-docs-nav {
  position: sticky;
  top: var(--hg-space-6);
  align-self: start;
}
.hg-docs-menu {
  display: none;
}
.hg-docs-links {
  display: grid;
  gap: 2px;
}
.hg-docs-links a {
  padding: var(--hg-space-2) var(--hg-space-3);
  border-left: 2px solid var(--hg-line);
  color: var(--hg-ink-muted);
  text-decoration: none;
  font-size: var(--hg-size-sm);
  line-height: 1.4;
}
.hg-docs-links a:hover {
  color: var(--hg-ink);
  border-left-color: color-mix(in srgb, var(--hg-accent) 45%, var(--hg-line));
}
.hg-docs-links a.is-active {
  border-left-color: var(--hg-accent);
  color: var(--hg-ink);
  font-weight: var(--hg-weight-bold);
}

/* The guide: about 70 characters a line, steps marked like the front page. */
.hg-docs-main {
  min-width: 0;
  max-width: 42rem;
}
.hg-docs-body {
  font-size: 1rem;
  line-height: 1.75;
}
.hg-docs-body :deep(h1) {
  font-size: clamp(2rem, 4vw, 2.6rem);
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 var(--hg-space-4);
}
/* The lede: the paragraph right under the title. */
.hg-docs-body :deep(h1 + p) {
  font-size: var(--hg-size-md);
  color: var(--hg-ink-muted);
  margin-bottom: var(--hg-space-6);
}
.hg-docs-body :deep(h2) {
  font-size: var(--hg-size-lg);
  letter-spacing: -0.015em;
  line-height: 1.3;
  margin: 3rem 0 var(--hg-space-4);
  padding-top: var(--hg-space-5);
  border-top: 1px solid var(--hg-line);
}
.hg-docs-body :deep(h2.hg-step) {
  display: flex;
  align-items: center;
  gap: var(--hg-space-4);
}
.hg-docs-body :deep(.hg-step-mark) {
  position: relative;
  isolation: isolate;
  flex: none;
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  font-size: var(--hg-size-sm);
  color: var(--hg-accent);
}
.hg-docs-body :deep(.hg-step-mark)::before {
  content: '';
  position: absolute;
  inset: 0.3rem;
  z-index: -1;
  border: 2px solid var(--hg-accent);
  transform: rotate(45deg);
}
.hg-docs-body :deep(h3) {
  font-size: var(--hg-size-md);
  margin: var(--hg-space-6) 0 var(--hg-space-2);
}
.hg-docs-body :deep(p),
.hg-docs-body :deep(ul),
.hg-docs-body :deep(ol),
.hg-docs-body :deep(table),
.hg-docs-body :deep(blockquote),
.hg-docs-body :deep(.hg-docs-code) {
  margin: 0 0 var(--hg-space-5);
}
.hg-docs-body :deep(ul),
.hg-docs-body :deep(ol) {
  padding-left: 1.4rem;
}
.hg-docs-body :deep(li) {
  margin-bottom: var(--hg-space-2);
  padding-left: var(--hg-space-1);
}
.hg-docs-body :deep(li::marker) {
  color: var(--hg-accent);
}
.hg-docs-body :deep(li > ul),
.hg-docs-body :deep(li > ol) {
  margin: var(--hg-space-2) 0 0;
}
.hg-docs-body :deep(strong) {
  color: var(--hg-ink);
}
.hg-docs-body :deep(a) {
  color: var(--hg-link);
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}
.hg-docs-body :deep(a:hover) {
  text-decoration-thickness: 2px;
}
.hg-docs-body :deep(code) {
  font-family: var(--hg-mono);
  font-size: 0.86em;
  padding: 0.1em 0.4em;
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-sm);
  overflow-wrap: anywhere;
}

/* Code blocks: one line per command, scrolling sideways when long; Copy sits beside it. */
.hg-docs-body :deep(.hg-docs-code) {
  display: flex;
  align-items: stretch;
  min-width: 0;
  background: color-mix(in srgb, var(--hg-canvas) 65%, black);
  border: 1px solid var(--hg-line);
  border-left: 2px solid var(--hg-accent);
}
.hg-docs-body :deep(pre) {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: var(--hg-space-4) var(--hg-space-5);
  overflow-x: auto;
  line-height: 1.6;
}
.hg-docs-body :deep(pre.has-more) {
  mask-image: linear-gradient(90deg, black calc(100% - 3rem), transparent);
}
.hg-docs-body :deep(pre:focus-visible) {
  outline: 2px solid var(--hg-focus, var(--hg-link));
  outline-offset: -2px;
}
.hg-docs-body :deep(pre code) {
  padding: 0;
  font-size: 0.875rem;
  background: none;
  border: 0;
  white-space: pre;
  overflow-wrap: normal;
}
.hg-docs-body :deep(.hg-docs-copy) {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--hg-space-2);
  min-width: 6rem;
  padding: 0 var(--hg-space-4);
  font: inherit;
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-bold);
  color: var(--hg-ink-muted);
  background: transparent;
  border: 0;
  border-left: 1px solid var(--hg-line);
  cursor: pointer;
}
.hg-docs-body :deep(.hg-docs-copy:hover) {
  color: var(--hg-ink);
  background: color-mix(in srgb, var(--hg-accent) 12%, transparent);
}
.hg-docs-body :deep(.hg-docs-copy:focus-visible) {
  outline: 2px solid var(--hg-focus, var(--hg-link));
  outline-offset: -2px;
}

/* On wide screens a command may run past the text column into the empty space beside it. */
@media (min-width: 76rem) {
  /* Out to the right edge of the page: the guide column plus the space beside it. */
  .hg-docs-body > :deep(.hg-docs-code) {
    margin-right: -9rem;
  }
  .hg-docs-body > :deep(.hg-docs-code pre code) {
    font-size: 0.8125rem;
  }
}

/* Notes ("> ...") read as an aside. */
.hg-docs-body :deep(blockquote) {
  padding: var(--hg-space-4) var(--hg-space-5);
  border-left: 2px solid var(--hg-link);
  background: color-mix(in srgb, var(--hg-panel) 75%, transparent);
  color: var(--hg-ink-muted);
  font-size: 0.9375rem;
}
.hg-docs-body :deep(blockquote > :last-child) {
  margin-bottom: 0;
}
.hg-docs-body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: var(--hg-space-5) 0;
  border: 1px solid var(--hg-line);
  border-radius: var(--hg-radius-sm);
}
.hg-docs-body :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: var(--hg-size-sm);
}
.hg-docs-body :deep(th),
.hg-docs-body :deep(td) {
  text-align: left;
  padding: var(--hg-space-3) var(--hg-space-4) var(--hg-space-3) 0;
  border-bottom: 1px solid var(--hg-line);
  vertical-align: top;
}
.hg-docs-body :deep(th) {
  color: var(--hg-ink-muted);
}
.hg-docs-body :deep(img) {
  max-width: 100%;
  border: 1px solid var(--hg-line);
}

/* Previous and next */
.hg-docs-pager {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--hg-space-4);
  margin-top: 4rem;
}
.hg-docs-pager-link {
  display: grid;
  gap: var(--hg-space-1);
  padding: var(--hg-space-4) var(--hg-space-5);
  border: 1px solid var(--hg-line);
  color: var(--hg-ink);
  text-decoration: none;
  font-weight: var(--hg-weight-bold);
}
.hg-docs-pager-link .hg-muted {
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-regular);
}
.hg-docs-pager-link:hover {
  border-color: var(--hg-accent);
}
.hg-docs-pager-link.is-next {
  grid-column: 2;
  text-align: right;
}

@media (max-width: 52rem) {
  .hg-docs-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--hg-space-5);
    padding-top: var(--hg-space-3);
  }
  .hg-docs-nav {
    position: static;
  }
  .hg-docs-links-wide {
    display: none;
  }
  .hg-docs-menu {
    display: block;
    border: 1px solid var(--hg-line);
    background: var(--hg-panel);
  }
  .hg-docs-menu summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0 var(--hg-space-3);
    padding: var(--hg-space-3) var(--hg-space-4);
    cursor: pointer;
    list-style: none;
  }
  .hg-docs-menu summary::-webkit-details-marker {
    display: none;
  }
  .hg-docs-menu summary .hg-muted {
    grid-column: 1;
    font-size: var(--hg-size-xs);
  }
  .hg-docs-menu-title {
    grid-column: 1;
    font-weight: var(--hg-weight-bold);
  }
  .hg-docs-menu summary :deep(svg) {
    grid-column: 2;
    grid-row: 1 / span 2;
    transition: transform 0.2s var(--hg-motion-easing);
  }
  .hg-docs-menu[open] summary :deep(svg) {
    transform: rotate(180deg);
  }
  .hg-docs-menu .hg-docs-links {
    padding: 0 var(--hg-space-2) var(--hg-space-3);
    border-top: 1px solid var(--hg-line);
    padding-top: var(--hg-space-2);
  }
}
@media (max-width: 36rem) {
  .hg-docs-bar,
  .hg-docs-layout {
    padding-left: var(--hg-space-4);
    padding-right: var(--hg-space-4);
  }
  .hg-docs-body {
    font-size: 0.9375rem;
  }
  .hg-docs-body :deep(pre) {
    padding: var(--hg-space-3) var(--hg-space-4);
  }
  .hg-docs-body :deep(pre code) {
    font-size: 0.8125rem;
  }
  .hg-docs-body :deep(.hg-docs-copy) {
    min-width: 0;
    padding: 0 var(--hg-space-3);
  }
  .hg-docs-body :deep(.hg-docs-copy span) {
    display: none;
  }
  .hg-docs-pager {
    grid-template-columns: minmax(0, 1fr);
  }
  .hg-docs-pager-link.is-next {
    grid-column: 1;
  }
}
</style>
