<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowDownUp, BookOpen } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Pager from '../components/ui/Pager.vue'
import Tabs from '../components/ui/Tabs.vue'
import { imageUrl } from '../image'
import { fmtDate } from '../genre'
import { lsGet } from '../ls'
import { useAuth } from '../stores/auth'

const id = useRoute().params.id as string
const auth = useAuth()
const load = () => ok(client.api.stories({ id: Number(id) }).get())
const story = ref<Awaited<ReturnType<typeof load>> | null>(null), loading = ref(true), error = ref(''), newestFirst = ref(false)
const tab = ref('toc')

const remoteLast = ref(0)
const last = computed(() => remoteLast.value || Number(lsGet(`last:${id}`)) || 0)
const nos = computed(() => story.value?.chapters.map(c => c.no) ?? [])
const startNo = computed(() => (nos.value.includes(last.value) ? last.value : nos.value[0]))
const SIZE = 50, tocPage = ref(1)
const all = computed(() => newestFirst.value ? [...(story.value?.chapters ?? [])].reverse() : story.value?.chapters ?? [])
const list = computed(() => all.value.slice((tocPage.value - 1) * SIZE, tocPage.value * SIZE))
const flip = () => { newestFirst.value = !newestFirst.value; tocPage.value = 1 }

onMounted(async () => {
  try { story.value = await load() } catch (e) { error.value = (e as Error).message }
  loading.value = false
  if (auth.user) remoteLast.value = (await ok(client.api.me.progress.get()).catch(() => [])).find(p => p.storyId === Number(id))?.no ?? 0
})
</script>

<template>
  <Bar v-if="loading" />
  <p v-if="error" class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>

  <div v-if="story" class="grid items-start gap-6 md:grid-cols-[230px_1fr] md:gap-12">
    <div class="w-[150px] md:sticky md:top-[84px] md:w-auto"><BookCover :title="story.title" :genre="story.genre" :image="story.coverImage" /></div>

    <div>
      <div class="eyebrow mb-2">{{ [story.genre, story.mood].filter(Boolean).join(' · ') || 'นิยาย' }}</div>
      <h1 class="font-serif text-[clamp(26px,4vw,38px)] font-bold leading-snug">{{ story.title }}</h1>
      <p class="mb-6 mt-4 max-w-[62ch] whitespace-pre-wrap leading-[1.85] text-fg/85">{{ story.synopsis }}</p>

      <div class="mb-10 flex flex-wrap gap-3">
        <Button v-if="startNo" size="lg" :to="`/story/${id}/read/${startNo}`"><BookOpen class="size-5" />{{ last ? `อ่านต่อตอนที่ ${startNo}` : `เริ่มอ่านตอนที่ ${startNo}` }}</Button>
        <Button v-if="nos.length > 1" variant="outline" size="lg" :to="`/story/${id}/read/${nos[nos.length - 1]}`">ตอนล่าสุด</Button>
      </div>

      <Tabs v-if="story.characters.length" v-model="tab" class="mb-4"
        :items="[{ value: 'toc', label: `สารบัญ (${story.chapters.length})` }, { value: 'cast', label: `ตัวละคร (${story.characters.length})` }]" />

      <section v-if="tab === 'cast'" aria-label="ตัวละคร">
        <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <li v-for="c in story.characters" :key="c.id" class="overflow-hidden rounded-xl border border-line bg-surface">
            <img v-if="c.image" :src="imageUrl(c.image)" :alt="`รูป ${c.name}`" class="aspect-[3/4] w-full object-cover" loading="lazy" decoding="async" />
            <div v-else class="grid aspect-[3/4] w-full place-items-center bg-secondary/15 font-serif text-5xl font-bold text-secondary" aria-hidden="true">{{ c.name.slice(0, 1) }}</div>
            <div class="p-3">
              <div class="font-serif font-bold leading-snug">{{ c.name }}</div>
              <div v-if="c.role" class="muted text-xs">{{ c.role }}</div>
              <p v-if="c.profile" class="muted mt-2 line-clamp-4 text-sm leading-relaxed">{{ c.profile }}</p>
            </div>
          </li>
        </ul>
      </section>

      <div v-show="tab === 'toc'" class="mb-2 flex items-center">
        <h2 class="font-serif text-xl font-bold">สารบัญ <span class="muted text-sm font-normal">· {{ story.chapters.length }} ตอน</span></h2>
        <div class="flex-1" />
        <Button v-if="story.chapters.length > 1" variant="ghost" size="sm" @click="flip"><ArrowDownUp class="size-4" />{{ newestFirst ? 'ใหม่ไปเก่า' : 'เก่าไปใหม่' }}</Button>
      </div>

      <ol v-show="tab === 'toc'" class="border-t border-line">
        <li v-for="c in list" :key="c.no" class="border-b border-line">
          <router-link :to="`/story/${id}/read/${c.no}`" class="grid grid-cols-[32px_1fr_auto] items-baseline gap-3 px-2 py-3.5 hover:bg-primary/5 md:grid-cols-[44px_1fr_auto_auto]">
            <span class="tabular-nums text-fg/50">{{ c.no }}</span>
            <span :class="['font-serif', c.no === last && 'font-bold']">{{ c.title || `ตอนที่ ${c.no}` }}</span>
            <span v-if="c.no === last" class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">อ่านล่าสุด</span><span v-else />
            <span class="muted hidden text-xs md:inline">{{ fmtDate(c.createdAt) }}</span>
          </router-link>
        </li>
        <li v-if="!list.length" class="muted py-4">ยังไม่มีตอนที่เผยแพร่</li>
      </ol>
      <Pager v-show="tab === 'toc'" v-model="tocPage" :size="SIZE" :total="all.length" />
    </div>
  </div>
</template>
