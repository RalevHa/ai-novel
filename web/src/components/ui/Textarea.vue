<script setup lang="ts">
withDefaults(defineProps<{ label?: string; rows?: number; placeholder?: string; disabled?: boolean; compact?: boolean }>(), { rows: 3 })
const model = defineModel<string>()
const id = `f-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <div :class="compact ? '' : 'mb-4'">
    <label v-if="label" :for="id" class="mb-1.5 block text-sm font-medium">{{ label }}</label>
    <textarea :id="id" v-model="model" :rows="rows" :placeholder="placeholder" :disabled="disabled"
      class="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 leading-relaxed outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60" />
  </div>
</template>
