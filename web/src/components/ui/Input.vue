<script setup lang="ts">
defineProps<{ label?: string; type?: string; hint?: string; autocomplete?: string; required?: boolean; list?: string; placeholder?: string; minlength?: number }>()
const model = defineModel<string>()
const id = `f-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <div class="mb-4">
    <label v-if="label" :for="id" class="mb-1.5 block text-sm font-medium">{{ label }}</label>
    <input :id="id" v-model="model" :type="type || 'text'" :autocomplete="autocomplete" :required="required" :list="list" :placeholder="placeholder" :minlength="minlength"
      class="h-11 w-full rounded-lg border border-line bg-surface px-3 outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25" />
    <p v-if="hint" class="mt-1 text-xs text-fg/65">{{ hint }}</p>
  </div>
</template>
