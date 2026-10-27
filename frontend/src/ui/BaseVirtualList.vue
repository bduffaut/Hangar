<script setup lang="ts" generic="T">
import VirtualScroller from 'primevue/virtualscroller'
import { ref } from 'vue'

// Renders only the visible rows of a long list (like a build log) at a fixed row height.
defineProps<{ items: T[]; itemHeight: number; height: string }>()
defineEmits<{ scroll: [event: Event] }>()
defineSlots<{ default(props: { item: T; index: number }): unknown }>()

const scroller = ref<InstanceType<typeof VirtualScroller> | null>(null)

defineExpose({
  scrollToEnd(count: number) {
    scroller.value?.scrollToIndex(Math.max(0, count - 1))
  },
})
</script>

<template>
  <VirtualScroller
    ref="scroller"
    :items="items"
    :item-size="itemHeight"
    :style="{ height }"
    @scroll="$emit('scroll', $event)"
  >
    <template #item="{ item, options }">
      <slot :item="item as T" :index="options.index as number" />
    </template>
  </VirtualScroller>
</template>
