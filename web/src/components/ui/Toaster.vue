<script setup lang="ts">
import { toasts } from '../../toast'
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id"
      :class="['pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm shadow-lg', t.kind === 'error' ? 'bg-danger text-white' : 'bg-fg text-bg']">{{ t.text }}</div>
  </div>
</template>
