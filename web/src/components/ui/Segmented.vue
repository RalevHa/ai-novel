<script setup lang="ts">
defineProps<{ options: readonly { k: string; n: string }[]; label: string }>()
const model = defineModel<string>()
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="grid auto-cols-fr grid-flow-col rounded-lg border border-line p-0.5">
    <button v-for="o in options" :key="o.k" type="button" role="radio" :aria-checked="model === o.k"
      :class="['h-9 rounded-md text-sm transition-colors', model === o.k ? 'bg-primary text-on-primary' : 'hover:bg-fg/5']" @click="model = o.k">{{ o.n }}</button>
  </div>
</template>
