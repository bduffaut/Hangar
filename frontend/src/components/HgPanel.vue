<script setup lang="ts">
// A primary surface: a notched panel with a title bar. `live` puts a status dot before the title,
// for panels that show something reporting right now.
withDefaults(
  defineProps<{
    title?: string
    description?: string
    padded?: boolean
    live?: 'on' | 'off' | 'warn' | null
  }>(),
  { padded: true, live: null },
)
</script>

<template>
  <section class="hg-panel hg-notched" :class="{ 'is-flush': padded === false }">
    <header v-if="title || $slots.actions" class="hg-panel-header">
      <div class="hg-panel-heading">
        <h2 v-if="title" class="hg-panel-title">
          <span
            v-if="live"
            class="hg-live-dot"
            :class="{ 'is-off': live === 'off', 'is-warn': live === 'warn' }"
            aria-hidden="true"
          />
          {{ title }}
        </h2>
        <p v-if="description" class="hg-muted hg-panel-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="hg-panel-actions"><slot name="actions" /></div>
    </header>
    <div class="hg-panel-body"><slot /></div>
  </section>
</template>

<style scoped>
.hg-panel {
  background: color-mix(in srgb, var(--hg-panel) 92%, transparent);
  border: 1px solid var(--hg-line);
  border-radius: 0;
  min-width: 0;
}
.hg-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--hg-space-3);
  padding: var(--hg-space-3) var(--hg-space-5);
  border-bottom: 1px solid var(--hg-line);
  background: color-mix(in srgb, var(--hg-raised) 35%, transparent);
}
.hg-panel-heading {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.hg-panel-title {
  display: flex;
  align-items: center;
  gap: var(--hg-space-2);
  font-size: var(--hg-size-base);
  letter-spacing: 0;
}
.hg-panel-description {
  font-size: var(--hg-size-sm);
}
.hg-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--hg-space-2);
}
.hg-panel-body {
  padding: var(--hg-space-5);
}
.is-flush .hg-panel-body {
  padding: 0;
}
@media (max-width: 44rem) {
  .hg-panel-header,
  .hg-panel-body {
    padding-left: var(--hg-space-4);
    padding-right: var(--hg-space-4);
  }
}
</style>
