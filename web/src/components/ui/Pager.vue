<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Button from './Button.vue'

const props = defineProps<{ size: number; total: number }>()
const page = defineModel<number>({ required: true })
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)))
</script>

<template>
  <nav v-if="pages > 1" class="mt-4 flex items-center justify-center gap-2 text-sm" aria-label="เลือกหน้า">
    <Button variant="ghost" size="icon" :disabled="page <= 1" aria-label="หน้าก่อนหน้า" @click="page = page - 1"><ChevronLeft class="size-5" /></Button>
    <span class="tabular-nums">หน้า {{ page }} / {{ pages }} <span class="muted">· {{ total }} รายการ</span></span>
    <Button variant="ghost" size="icon" :disabled="page >= pages" aria-label="หน้าถัดไป" @click="page = page + 1"><ChevronRight class="size-5" /></Button>
  </nav>
</template>
