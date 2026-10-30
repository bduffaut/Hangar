<script setup lang="ts">
import {
  type DashboardGridApi,
  DashboardGrid,
  type GridWidget,
  vDraggableWidget,
} from 'custom-dashboard-grid'
import 'custom-dashboard-grid/style.css'
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { allWidgets, GRID, useDashboardData, widgetById, widgetFor } from '../../dashboard/index.ts'
import { useMetricsStore } from '../../stores/metrics.ts'
import WidgetFrame from './WidgetFrame.vue'

// The home screen: registered widgets on the owner's grid. While customizing, widgets can be
// dragged, resized, removed, and added from the list above the grid; every change is saved.
const widgets = defineModel<GridWidget[]>({ required: true })
const props = defineProps<{ editing: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const grid = useTemplateRef<DashboardGridApi>('grid')
const data = useDashboardData()
const metrics = useMetricsStore()
onMounted(() => metrics.acquire())
onBeforeUnmount(() => metrics.release())

/** Widgets not on the board yet, offered while customizing. */
const available = computed(() => {
  const placed = new Set(widgets.value.map((w) => w.id))
  return allWidgets.value.filter((w) => !placed.has(w.id))
})

function add(id: string) {
  const entry = widgetFor(id)
  if (entry && grid.value?.addWidget(entry, { scrollIntoView: true })) emit('changed')
}

const titleOf = (widget: GridWidget) => widgetById(widget.id)?.title ?? widget.id

defineExpose({
  undo: () => grid.value?.undo(),
  redo: () => grid.value?.redo(),
  canUndo: computed(() => grid.value?.canUndo ?? false),
  canRedo: computed(() => grid.value?.canRedo ?? false),
})
</script>

<template>
  <div class="hg-board" :class="{ 'is-editing': props.editing }">
    <section v-if="editing" class="hg-board-add" aria-label="Add a widget">
      <p class="hg-muted">
        {{
          available.length
            ? 'Drag a widget onto the board, or select it to add it in the first free spot.'
            : 'Every widget is on the board. Remove one to move it back here.'
        }}
      </p>
      <ul v-if="available.length" class="hg-board-add-list">
        <li v-for="widget in available" :key="widget.id">
          <button
            v-draggable-widget="() => widgetFor(widget.id)"
            type="button"
            class="hg-board-add-item"
            @click="add(widget.id)"
          >
            <strong>{{ widget.title }}</strong>
            <span>{{ widget.description }}</span>
          </button>
        </li>
      </ul>
    </section>

    <DashboardGrid
      ref="grid"
      v-model="widgets"
      :columns="GRID.columns"
      :row-height="GRID.rowHeight"
      :gap="GRID.gap"
      :breakpoints="GRID.breakpoints"
      breakpoint-layout="list"
      :editable="editing"
      drag-handle=".hg-widget-head"
      drag-cancel="button, a, input"
      show-cells="editing"
      :min-rows="4"
      :widget-label="titleOf"
      :animation="{ preset: 'smooth', enter: 'rise' }"
      @change="(_, info) => info.source === 'user' && emit('changed')"
      @add="emit('changed')"
      @remove="emit('changed')"
    >
      <template #default="{ widget, remove }">
        <WidgetFrame
          v-if="widgetById(widget.id)"
          :title="titleOf(widget)"
          :editable="editing"
          :fit="!!widget.sizeToContent"
          :data-widget="widget.id"
          @remove="remove"
        >
          <component
            :is="widgetById(widget.id)!.component"
            v-bind="widgetById(widget.id)!.props"
            :data="data"
          />
        </WidgetFrame>
      </template>
    </DashboardGrid>
  </div>
</template>

<style scoped>
.hg-board :deep(.dg-content) {
  padding-bottom: v-bind('`${GRID.space}px`');
}
.hg-board-add {
  display: grid;
  gap: var(--hg-space-3);
  margin-bottom: var(--hg-space-5);
  padding: var(--hg-space-4);
  border: 1px dashed color-mix(in srgb, var(--hg-accent) 55%, var(--hg-line));
  border-radius: var(--hg-radius-lg);
}
.hg-board-add p {
  font-size: var(--hg-size-sm);
}
.hg-board-add-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: var(--hg-space-2);
}
.hg-board-add-item {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 0.15rem;
  padding: var(--hg-space-2) var(--hg-space-3);
  text-align: left;
  font: inherit;
  color: var(--hg-ink);
  background: var(--hg-panel);
  border: 1px solid var(--hg-line);
  border-left: 3px solid var(--hg-accent);
  border-radius: var(--hg-radius-md);
  cursor: grab;
  transition:
    transform var(--hg-motion-fast) var(--hg-motion-easing),
    border-color var(--hg-motion-fast) var(--hg-motion-easing);
}
.hg-board-add-item:hover {
  transform: translateX(2px);
  border-color: var(--hg-ink-muted);
  border-left-color: var(--hg-accent);
}
.hg-board-add-item strong {
  font-size: var(--hg-size-sm);
}
.hg-board-add-item span {
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
}
</style>
