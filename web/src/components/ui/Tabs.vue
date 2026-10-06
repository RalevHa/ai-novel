<script setup lang="ts">
defineProps<{ items: { value: string; label: string }[] }>()
const model = defineModel<string>()
</script>

<template>
  <div role="tablist" class="flex gap-6 overflow-x-auto whitespace-nowrap border-b border-line">
    <button v-for="t in items" :key="t.value" type="button" role="tab" :aria-selected="model === t.value"
      :class="['-mb-px min-w-11 shrink-0 border-b-2 px-1 py-3 text-center text-sm font-medium transition-colors', model === t.value ? 'border-primary text-primary' : 'border-transparent text-fg/75 hover:text-fg']"
      @click="model = t.value">{{ t.label }}</button>
  </div>
</template>
