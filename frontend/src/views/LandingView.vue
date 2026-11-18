<script setup lang="ts">
import { landingCopy } from '@hangar/shared'
import BrandMark from '../brand/BrandMark.vue'
import CopyField from '../components/CopyField.vue'
import { useDocumentTitle } from '../composables/useDocumentTitle.ts'
import { INSTALL_COMMAND } from '../site/install.ts'
import { BaseButton, BaseIcon } from '../ui/index.ts'

// The public site's front door: what Hangar does, how to get it, and what runs where. Nothing
// here talks to a server; the tour runs in the browser with sample data.
useDocumentTitle('Hangar: deploy from GitHub to a computer you own')
const install = { name: 'docs', params: { slug: 'install' } }
const tour = { name: 'home' }
</script>

<template>
  <div class="hg-landing">
    <header class="hg-landing-bar">
      <BrandMark />
      <nav class="hg-landing-links" aria-label="Site">
        <RouterLink :to="{ name: 'docs' }">{{ landingCopy.docs }}</RouterLink>
        <a href="https://github.com/bduffaut/Hangar" rel="noopener">GitHub</a>
      </nav>
    </header>

    <main class="hg-landing-main">
      <section class="hg-hero" aria-labelledby="hero-title">
        <div class="hg-hero-text">
          <h1 id="hero-title">{{ landingCopy.title }}</h1>
          <p class="hg-hero-lede">{{ landingCopy.lede }}</p>
          <div class="hg-hero-actions">
            <RouterLink v-slot="{ navigate }" :to="install" custom>
              <BaseButton
                variant="primary"
                icon="download"
                :label="landingCopy.install"
                class="hg-hero-cta"
                @click="navigate"
              />
            </RouterLink>
            <RouterLink v-slot="{ navigate }" :to="tour" custom>
              <BaseButton
                icon="play"
                :label="landingCopy.tour"
                class="hg-hero-cta"
                @click="navigate"
              />
            </RouterLink>
          </div>
          <p class="hg-muted hg-hero-note">{{ landingCopy.tourNote }}</p>
          <div class="hg-hero-command">
            <p class="hg-muted hg-hero-note">{{ landingCopy.commandLabel }}</p>
            <CopyField :value="INSTALL_COMMAND" label="install command" wrap />
          </div>
        </div>

        <!-- One deploy, as the dashboard shows it: the only animation on the page. -->
        <figure class="hg-plan hg-notched" aria-label="An example deploy">
          <figcaption class="hg-plan-head">
            <span class="hg-live-dot" aria-hidden="true" />
            <span class="hg-plan-name">{{ landingCopy.flightPlan }}</span>
          </figcaption>
          <ol class="hg-plan-rows">
            <li v-for="(row, i) in landingCopy.plan" :key="row.label" :style="{ '--i': i }">
              <span class="hg-plan-label">{{ row.label }}</span>
              <span class="hg-plan-value">{{ row.value }}</span>
            </li>
            <li class="hg-plan-status" :style="{ '--i': landingCopy.plan.length }">
              <span class="hg-plan-label">Status</span>
              <span class="hg-plan-live"
                ><BaseIcon name="check" :size="14" /> {{ landingCopy.planStatus }}</span
              >
            </li>
          </ol>
          <div class="hg-plan-bars" aria-hidden="true">
            <span
              v-for="n in 28"
              :key="n"
              :style="{ height: `${18 + ((n * 37) % 64)}%`, '--i': n }"
              :class="{ 'is-fail': n === 9, 'is-now': n === 28 }"
            />
          </div>
        </figure>
      </section>

      <section class="hg-route" aria-labelledby="route-title">
        <h2 id="route-title">{{ landingCopy.stepsTitle }}</h2>
        <ol class="hg-route-steps">
          <li v-for="(step, i) in landingCopy.steps" :key="step.title">
            <span class="hg-route-mark" aria-hidden="true">{{ i + 1 }}</span>
            <h3>{{ step.title }}</h3>
            <p class="hg-muted">{{ step.body }}</p>
          </li>
        </ol>
      </section>

      <section class="hg-where" aria-labelledby="where-title">
        <h2 id="where-title">{{ landingCopy.whereTitle }}</h2>
        <div class="hg-where-map">
          <article v-for="place in landingCopy.where" :key="place.name" class="hg-where-node">
            <h3>{{ place.name }}</h3>
            <p class="hg-muted">{{ place.body }}</p>
          </article>
        </div>
        <div class="hg-needs">
          <h3>{{ landingCopy.needsTitle }}</h3>
          <ul>
            <li v-for="need in landingCopy.needs" :key="need">{{ need }}</li>
          </ul>
        </div>
      </section>

      <section class="hg-faq" aria-labelledby="faq-title">
        <h2 id="faq-title">{{ landingCopy.faqTitle }}</h2>
        <div class="hg-faq-list">
          <details v-for="item in landingCopy.faq" :key="item.q" class="hg-faq-item">
            <summary>{{ item.q }}</summary>
            <p class="hg-muted">{{ item.a }}</p>
          </details>
        </div>
      </section>

      <section class="hg-closer" aria-label="Get started">
        <p class="hg-closer-line">{{ landingCopy.free }}</p>
        <div class="hg-hero-actions">
          <RouterLink v-slot="{ navigate }" :to="install" custom>
            <BaseButton
              variant="primary"
              icon="download"
              :label="landingCopy.install"
              @click="navigate"
            />
          </RouterLink>
          <RouterLink v-slot="{ navigate }" :to="tour" custom>
            <BaseButton icon="play" :label="landingCopy.tour" @click="navigate" />
          </RouterLink>
        </div>
      </section>
    </main>

    <footer class="hg-landing-foot">
      <a href="https://github.com/bduffaut/Hangar" rel="noopener"
        ><BaseIcon name="github" :size="16" /> {{ landingCopy.source }}</a
      >
      <nav class="hg-landing-links" aria-label="About this site">
        <RouterLink :to="{ name: 'docs' }">{{ landingCopy.docs }}</RouterLink>
        <RouterLink :to="{ name: 'privacy' }">{{ landingCopy.privacy }}</RouterLink>
      </nav>
    </footer>
  </div>
</template>

<style scoped>
.hg-landing {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.hg-landing-bar,
.hg-landing-main,
.hg-landing-foot {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding-left: var(--hg-space-5);
  padding-right: var(--hg-space-5);
}
.hg-landing-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4rem;
}
.hg-hero-command {
  display: grid;
  gap: var(--hg-space-2);
  margin-top: var(--hg-space-2);
  max-width: 34rem;
}
.hg-landing-bar .hg-landing-links a {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
  text-decoration: none;
}
.hg-landing-bar .hg-landing-links a:hover {
  color: var(--hg-ink);
}
.hg-landing-signin {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
  text-decoration: none;
}
.hg-landing-signin:hover {
  color: var(--hg-ink);
}
.hg-landing-main {
  flex: 1;
  display: grid;
  gap: 6rem;
  padding-top: 4.5rem;
  padding-bottom: 6rem;
}

/* Hero */
.hg-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  align-items: center;
  gap: 4rem;
}
.hg-hero-text {
  display: grid;
  gap: var(--hg-space-5);
}
.hg-hero h1 {
  font-size: clamp(2.3rem, 4.6vw, 3.6rem);
  line-height: 1.04;
  letter-spacing: -0.035em;
  max-width: 14ch;
}
.hg-hero-lede {
  font-size: var(--hg-size-md);
  line-height: 1.6;
  color: var(--hg-ink-muted);
  max-width: 34rem;
}
.hg-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-3);
}
.hg-hero-note {
  font-size: var(--hg-size-sm);
}

/* The flight plan */
.hg-plan {
  --hg-notch: 16px;
  margin: 0;
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
}
.hg-plan-head {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
  padding: var(--hg-space-3) var(--hg-space-4);
  border-bottom: 1px solid var(--hg-line);
  font-family: var(--hg-mono);
  font-size: var(--hg-size-sm);
}
.hg-plan-rows {
  list-style: none;
  margin: 0;
  padding: var(--hg-space-2) var(--hg-space-4);
  position: relative;
}
/* The course line: drawn down the left edge as each leg of the deploy completes. */
.hg-plan-rows::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--hg-space-3);
  bottom: var(--hg-space-3);
  width: 2px;
  background: var(--hg-accent);
  transform-origin: top;
  animation: hg-course 2.4s var(--hg-motion-easing) 0.3s both;
}
.hg-plan-rows li {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: var(--hg-space-3);
  padding: var(--hg-space-3) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hg-line) 55%, transparent);
  font-size: var(--hg-size-sm);
  animation: hg-leg 0.45s var(--hg-motion-easing) both;
  animation-delay: calc(0.3s + var(--i) * 0.45s);
}
.hg-plan-rows li:last-child {
  border-bottom: 0;
}
.hg-plan-label {
  color: var(--hg-ink-muted);
}
.hg-plan-value {
  font-family: var(--hg-mono);
}
.hg-plan-live {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-1);
  color: var(--hg-status-ready);
  font-weight: var(--hg-weight-bold);
}
.hg-plan-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 3.25rem;
  padding: var(--hg-space-3) var(--hg-space-4);
  border-top: 1px solid var(--hg-line);
}
.hg-plan-bars span {
  flex: 1;
  background: color-mix(in srgb, var(--hg-status-ready) 45%, transparent);
}
.hg-plan-bars span.is-fail {
  background: color-mix(in srgb, var(--hg-status-failed) 70%, transparent);
}
.hg-plan-bars span.is-now {
  background: var(--hg-accent);
}
@keyframes hg-course {
  from {
    transform: scaleY(0);
  }
}
@keyframes hg-leg {
  from {
    opacity: 0.25;
  }
}

/* The route: four legs, in order */
.hg-route,
.hg-where {
  display: grid;
  gap: var(--hg-space-6);
}
.hg-route h2,
.hg-where h2 {
  font-size: var(--hg-size-xl);
  letter-spacing: -0.02em;
}
.hg-route-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--hg-space-5);
  position: relative;
}
/* The dashed course between the waypoints. */
.hg-route-steps::before {
  content: '';
  position: absolute;
  top: 1.05rem;
  left: 1.1rem;
  right: 10%;
  border-top: 2px dashed color-mix(in srgb, var(--hg-accent) 55%, transparent);
}
.hg-route-steps li {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--hg-space-2);
}
.hg-route-mark {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  margin-bottom: var(--hg-space-2);
  font-size: var(--hg-size-sm);
  font-weight: var(--hg-weight-bold);
  color: var(--hg-accent);
}
/* A waypoint: the diamond of a chart's reporting point. */
.hg-route-mark::before {
  content: '';
  position: absolute;
  inset: 0.3rem;
  z-index: -1;
  background: var(--hg-canvas);
  border: 2px solid var(--hg-accent);
  transform: rotate(45deg);
}
.hg-route-steps h3 {
  font-size: var(--hg-size-md);
}
.hg-route-steps p {
  font-size: var(--hg-size-sm);
}

/* What runs where */
.hg-where-map {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--hg-space-6);
}
.hg-where-node {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--hg-space-2);
  padding-top: var(--hg-space-4);
  border-top: 2px solid var(--hg-line);
}
.hg-where-node:nth-child(2) {
  border-top-color: var(--hg-accent);
}
.hg-where-node h3 {
  font-size: var(--hg-size-md);
}
.hg-where-node p {
  font-size: var(--hg-size-sm);
}
.hg-needs {
  display: grid;
  gap: var(--hg-space-2);
  padding: var(--hg-space-4) var(--hg-space-5);
  background: color-mix(in srgb, var(--hg-panel) 70%, transparent);
  border-left: 2px solid var(--hg-link);
}
.hg-needs h3 {
  font-size: var(--hg-size-base);
}
.hg-needs ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
  display: grid;
  gap: var(--hg-space-1);
}
.hg-landing-foot {
  padding-top: var(--hg-space-5);
  padding-bottom: var(--hg-space-6);
  border-top: 1px solid var(--hg-line);
  font-size: var(--hg-size-sm);
}
.hg-landing-foot a:hover {
  color: var(--hg-ink);
}
.hg-landing-foot a {
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-2);
  color: var(--hg-ink-muted);
  text-decoration: none;
}

/* Questions */
.hg-faq {
  display: grid;
  gap: var(--hg-space-5);
}
.hg-faq h2 {
  font-size: var(--hg-size-xl);
  letter-spacing: -0.02em;
}
.hg-faq-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--hg-space-6);
}
.hg-faq-item {
  border-top: 1px solid var(--hg-line);
  padding: var(--hg-space-4) 0;
}
.hg-faq-item summary {
  cursor: pointer;
  font-weight: var(--hg-weight-bold);
  list-style: none;
  display: flex;
  justify-content: space-between;
  gap: var(--hg-space-3);
}
.hg-faq-item summary::-webkit-details-marker {
  display: none;
}
.hg-faq-item summary::after {
  content: '+';
  color: var(--hg-accent);
  font-family: var(--hg-mono);
  transition: transform var(--hg-motion-fast, 0.15s) var(--hg-motion-easing);
}
.hg-faq-item[open] summary::after {
  transform: rotate(45deg);
}
.hg-faq-item p {
  margin: var(--hg-space-3) 0 0;
  font-size: var(--hg-size-sm);
  line-height: 1.6;
}

/* The last word */
.hg-closer {
  display: grid;
  justify-items: center;
  gap: var(--hg-space-4);
  padding: var(--hg-space-6) var(--hg-space-5);
  text-align: center;
  border: 1px solid var(--hg-line);
  background:
    radial-gradient(
      ellipse at top,
      color-mix(in srgb, var(--hg-accent) 12%, transparent),
      transparent 70%
    ),
    var(--hg-panel);
}
.hg-closer-line {
  margin: 0;
  font-size: var(--hg-size-lg, 1.25rem);
  font-weight: var(--hg-weight-bold);
  letter-spacing: -0.01em;
}
.hg-closer .hg-hero-actions {
  justify-content: center;
}
.hg-landing-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--hg-space-3);
}
.hg-landing-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-4);
}

@media (max-width: 60rem) {
  .hg-faq-list {
    grid-template-columns: 1fr;
  }
  .hg-hero {
    grid-template-columns: 1fr;
    gap: 3rem;
  }
  .hg-route-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: var(--hg-space-6);
  }
  .hg-route-steps::before {
    display: none;
  }
  .hg-where-map {
    grid-template-columns: 1fr;
    gap: var(--hg-space-5);
  }
}
@media (max-width: 36rem) {
  .hg-landing-bar,
  .hg-landing-main,
  .hg-landing-foot {
    padding-left: var(--hg-space-4);
    padding-right: var(--hg-space-4);
  }
  .hg-landing-main {
    padding-top: var(--hg-space-6);
    gap: 4rem;
  }
  .hg-route-steps {
    grid-template-columns: 1fr;
  }
  .hg-plan-rows li {
    grid-template-columns: 5.5rem 1fr;
  }
}
</style>
