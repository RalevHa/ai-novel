<script setup lang="ts">
import { computed } from 'vue'
import { coverVars, kanjiFor } from '../genre'
import { imageUrl } from '../image'

// an uploaded image replaces the generated art; otherwise the cover is drawn from the title + genre
const props = defineProps<{ title: string; genre?: string; image?: string }>()
const vars = computed(() => coverVars(props.title + (props.genre ?? '')))
const kanji = computed(() => kanjiFor(props.genre))
</script>

<template>
  <div class="cover" :class="{ 'no-obi': !genre, 'has-img': !!image }" :style="vars" role="img" :aria-label="`ปก ${title}`">
    <img v-if="image" :src="imageUrl(image)" alt="" loading="lazy" decoding="async" />
    <template v-else>
      <span class="sun" />
      <span class="kanji" aria-hidden="true">{{ kanji }}</span>
      <span class="ttl">{{ title }}</span>
      <span v-if="genre" class="obi">{{ genre }}</span>
    </template>
  </div>
</template>
