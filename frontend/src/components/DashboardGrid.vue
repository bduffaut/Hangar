<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { allWidgets, useDashboardData } from '../dashboard/index.ts'
import { useMetricsStore } from '../stores/metrics.ts'

// Lays out the registered widgets and hands each one the dashboard's data. Wide widgets span the
// row; half and third widgets share it. Metrics stream while the dashboard is on screen.
const widgets = computed(() => allWidgets.value.filter((widget) => widget.enabledByDefault))
const data = useDashboardData()
const metrics = useMetricsStore()
onMounted(() => metrics.acquire())
onBeforeUnmount(() => metrics.release())
</script>

<template>
  <div class="hg-dashboard">
    <div
      v-for="widget in widgets"
      :key="widget.id"
      class="hg-dashboard-cell"
      :class="`is-${widget.size}`"
      :data-widget="widget.id"
    >
      <component :is="widget.component" :data="data" />
    </div>
  </div>
</template>

<style scoped>
.hg-dashboard {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--hg-space-5);
}
.hg-dashboard-cell {
  min-width: 0;
}
.is-full {
  grid-column: span 6;
}
.is-half {
  grid-column: span 3;
}
.is-third {
  grid-column: span 2;
}
@media (max-width: 60rem) {
  .is-half,
  .is-third {
    grid-column: span 6;
  }
}
</style>
