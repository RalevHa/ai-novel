<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { stripChapterPrefix } from '../genre'

defineProps<{ chapters: { no: number; title: string }[] }>()
const model = defineModel<number>()
</script>

<template>
  <div class="relative min-w-0">
    <!-- native select: accessible by default and gets the OS picker on phones -->
    <select v-model.number="model" aria-label="เลือกตอน"
      class="h-10 w-full appearance-none truncate rounded-lg border border-line bg-surface pl-3 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
      <option v-for="c in chapters" :key="c.no" :value="c.no">{{ c.no }}. {{ stripChapterPrefix(c.title) || `ตอนที่ ${c.no}` }}</option>
    </select>
    <ChevronDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg/60" aria-hidden="true" />
  </div>
</template>
