<script setup lang="ts">
import InputText from 'primevue/inputtext'

const model = defineModel<string>({ default: '' })
defineProps<{
  id: string
  type?: 'text' | 'url' | 'search' | 'number'
  placeholder?: string
  invalid?: boolean
  autocomplete?: string
  mono?: boolean
  disabled?: boolean
  inputmode?: 'text' | 'numeric' | 'url'
}>()
</script>

<template>
  <InputText
    :id="id"
    v-model="model"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :invalid="invalid"
    :autocomplete="autocomplete ?? 'off'"
    :disabled="disabled"
    :inputmode="inputmode"
    :aria-describedby="`${id}-help ${id}-error`"
    :aria-invalid="invalid || undefined"
    spellcheck="false"
    fluid
    :class="{ 'hg-mono': mono }"
  />
</template>

<style scoped>
.hg-mono {
  font-family: var(--hg-mono);
  font-size: var(--hg-size-sm);
}
</style>
