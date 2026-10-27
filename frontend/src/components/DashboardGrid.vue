<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  useDashboardData,
  isWidgetShown,
  moveWidget,
  orderedWidgets,
  resetLayout,
  setWidgetShown,
} from '../dashboard/index.ts'
import { useMetricsStore } from '../stores/metrics.ts'
import { BaseButton, BaseDialog, BaseSwitch } from '../ui/index.ts'

// Lays out the registered widgets and hands each one the dashboard's data. Wide widgets span the
// row; half and third widgets share it. Metrics stream while the dashboard is on screen.
const customizing = ref(false)
const data = useDashboardData()
const metrics = useMetricsStore()
onMounted(() => metrics.acquire())
onBeforeUnmount(() => metrics.release())
</script>

<template>
  <div class="hg-dashboard">
    <template v-for="widget in orderedWidgets" :key="widget.id">
      <div
        v-if="isWidgetShown(widget)"
        class="hg-dashboard-cell"
        :class="`is-${widget.size}`"
        :data-widget="widget.id"
      >
        <component :is="widget.component" :data="data" />
      </div>
    </template>
  </div>
  <div class="hg-dashboard-footer">
    <BaseButton
      variant="ghost"
      size="sm"
      icon="layout"
      label="Customize dashboard"
      @click="customizing = true"
    />
  </div>

  <BaseDialog v-model:visible="customizing" title="Customize dashboard">
    <p class="hg-muted hg-dialog-intro">
      Choose which sections appear and in what order. This is saved in this browser.
    </p>
    <ul class="hg-widget-list">
      <li v-for="(widget, i) in orderedWidgets" :key="widget.id" class="hg-widget-row">
        <BaseSwitch
          :id="`widget-${widget.id}`"
          :model-value="isWidgetShown(widget)"
          @update:model-value="(on: boolean) => setWidgetShown(widget, on)"
        />
        <label :for="`widget-${widget.id}`" class="hg-widget-text">
          <strong>{{ widget.title }}</strong>
          <span class="hg-muted">{{ widget.description }}</span>
        </label>
        <span class="hg-widget-move">
          <BaseButton
            size="sm"
            variant="ghost"
            label="Up"
            :disabled="i === 0"
            :aria-label="`Move ${widget.title} up`"
            @click="moveWidget(widget, -1)"
          />
          <BaseButton
            size="sm"
            variant="ghost"
            label="Down"
            :disabled="i === orderedWidgets.length - 1"
            :aria-label="`Move ${widget.title} down`"
            @click="moveWidget(widget, 1)"
          />
        </span>
      </li>
    </ul>
    <template #footer>
      <BaseButton variant="ghost" label="Reset to default" @click="resetLayout" />
      <BaseButton variant="primary" label="Done" @click="customizing = false" />
    </template>
  </BaseDialog>
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
.hg-dashboard-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--hg-space-4);
}
.hg-dialog-intro {
  margin-bottom: var(--hg-space-4);
}
.hg-widget-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-3);
}
.hg-widget-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--hg-space-3);
  align-items: center;
}
.hg-widget-text {
  display: grid;
  font-size: var(--hg-size-sm);
}
.hg-widget-move {
  display: flex;
}
</style>
