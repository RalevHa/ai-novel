<script setup lang="ts">
import { Star } from 'lucide-vue-next'

// "★ 4.3 (12)" under a book; nothing until the story has a review
defineProps<{ rating?: number | null; count?: number }>()
</script>

<template>
  <div v-if="count && rating" class="muted text-xs" :aria-label="`คะแนนเฉลี่ย ${rating.toFixed(1)} จาก 5 (${count} รีวิว)`">
    <Star class="-mt-0.5 mr-0.5 inline size-3 fill-current text-primary" aria-hidden="true" />{{ rating.toFixed(1) }} <span class="opacity-80">({{ count }})</span>
  </div>
</template>
