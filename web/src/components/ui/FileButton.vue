<script setup lang="ts">
// A real <label> around a visually hidden file input: keyboard and screen-reader friendly, no button-in-label nesting.
defineProps<{ accept?: string; disabled?: boolean }>()
const emit = defineEmits<{ pick: [File] }>()

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // lets the same file be picked again
  if (file) emit('pick', file)
}
</script>

<template>
  <label :class="['inline-flex h-8 cursor-pointer select-none items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:bg-fg/5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary', disabled && 'pointer-events-none opacity-50']">
    <input type="file" :accept="accept || 'image/png,image/jpeg,image/webp'" class="sr-only" :disabled="disabled" @change="onChange" />
    <slot />
  </label>
</template>
