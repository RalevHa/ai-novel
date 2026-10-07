<script setup lang="ts">
import BookCover from './BookCover.vue'
import RatingLine from './RatingLine.vue'

// One book on a shelf: cover, title, chapter count, author, rating. The title always reserves two lines (and is balanced) so
// the details below line up across a row whatever the title length.
defineProps<{
  story: { id: number; title: string; genre?: string; mood?: string; coverImage?: string; chapterCount: number; authorName?: string; rating?: number | null; ratingCount?: number }
  badge?: string
}>()
</script>

<template>
  <router-link :to="`/story/${story.id}`" class="book">
    <div class="relative">
      <BookCover :title="story.title" :genre="story.genre" :image="story.coverImage" />
      <span v-if="badge" class="absolute left-2 top-2 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium text-fg shadow">{{ badge }}</span>
    </div>
    <div class="line-clamp-2 mt-3 min-h-[2.75em] text-balance font-serif font-bold leading-snug">{{ story.title }}</div>
    <div class="muted mt-1 text-xs">{{ story.chapterCount }} ตอน<template v-if="story.mood"> · {{ story.mood }}</template></div>
    <div v-if="story.authorName" class="muted truncate text-xs">โดย {{ story.authorName }}</div>
    <RatingLine :rating="story.rating" :count="story.ratingCount" />
  </router-link>
</template>
