<script setup lang="ts" generic="T extends string">
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'

// Each tab's content goes in a slot named after its value: <template #radio>…</template>.
const model = defineModel<T>({ required: true })
defineProps<{ tabs: { value: T; label: string; hint?: string }[] }>()
</script>

<template>
  <Tabs v-model:value="model" lazy>
    <TabList>
      <Tab v-for="tab in tabs" :key="tab.value" :value="tab.value" :title="tab.hint">
        {{ tab.label }}
      </Tab>
    </TabList>
    <TabPanels>
      <TabPanel v-for="tab in tabs" :key="tab.value" :value="tab.value">
        <slot :name="tab.value" />
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>

<style scoped>
/* Tabs sit on the page itself; the panels inside them provide their own surfaces. */
:deep(.p-tabs),
:deep(.p-tablist-tab-list),
:deep(.p-tabpanels) {
  background: transparent;
}
:deep(.p-tabpanels) {
  padding: var(--hg-space-5) 0 0;
}
</style>
