<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, Search, X } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import StoryCard from '../components/StoryCard.vue'
import Button from '../components/ui/Button.vue'
import Segmented from '../components/ui/Segmented.vue'
import { fmtDate, parseDb } from '../genre'
import { lsGet, lsSet } from '../ls'
import { useResume } from '../resume'
import { allTags, isRecent, shelf, SORTS, type Sort } from '../shelf'
import { useAuth } from '../stores/auth'
import { useBookmarks } from '../stores/bookmarks'

const auth = useAuth(), route = useRoute()
const marks = useBookmarks()
const load = () => ok(client.api.stories.get())
type Story = Awaited<ReturnType<typeof load>>[number]
const stories = ref<Story[]>([]), loading = ref(true), error = ref(''), genre = ref<string | null>(typeof route.query.genre === 'string' ? route.query.genre : null)

const genres = computed(() => allTags(stories.value))
// search + order are applied in the browser (the shelf is not paginated); the order is remembered
// links from elsewhere (header search, landing genre chips, ...) can preset these: /story?q=..&genre=..&sort=..
const qs = typeof route.query.sort === 'string' ? route.query.sort : lsGet('homeSort')
const query = ref(typeof route.query.q === 'string' ? route.query.q : ''), sort = ref<Sort>(SORTS.some(x => x.k === qs) ? qs as Sort : 'updated')
const searchEl = ref<HTMLInputElement>()
watch(sort, v => lsSet('homeSort', v))
watch(() => route.query.search, async v => { if (v !== undefined) { await nextTick(); searchEl.value?.focus() } }) // header search icon while already on this page
const mine = ref(false) // only the stories this reader follows
const hideAdult = ref(false) // leave out the 18+ stories
const hasAdult = computed(() => stories.value.some(s => s.contentRating === 'adult'))
const myStories = computed(() => stories.value.filter(s => marks.has(s.id)).length)
const shown = computed(() => shelf(stories.value, { q: query.value, genre: genre.value, sort: sort.value, ids: mine.value ? new Set(marks.ids) : null, hideAdult: hideAdult.value }))
const filtering = computed(() => !!query.value.trim() || genre.value !== null || mine.value || hideAdult.value)
const clearFilters = () => { query.value = ''; genre.value = null; mine.value = false; hideAdult.value = false }
const badge = (s: Story) => s.status === 'completed' ? 'จบแล้ว' : isRecent(s.updatedAt) ? 'อัปเดตใหม่' : ''
const latest = computed(() => stories.value.map(s => parseDb(s.updatedAt)).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0])

const resume = useResume(stories)
const chip = (on: boolean) => ['inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors sm:min-h-9', on ? 'border-primary bg-primary text-on-primary' : 'border-line hover:bg-fg/5']

onMounted(async () => {
  try { stories.value = await load() } catch (e) { error.value = (e as Error).message }
  loading.value = false
  marks.load()
  if (route.query.search !== undefined) { await nextTick(); searchEl.value?.focus() } // the header's search icon
})
</script>

<template>
  <header class="mb-8">
    <h1 class="font-serif text-[clamp(28px,4.5vw,44px)] font-bold leading-tight">นิยายทั้งหมด</h1>
    <p v-if="stories.length" class="muted mt-2">{{ stories.length }} เรื่อง<template v-if="latest"> · อัปเดตล่าสุด {{ fmtDate(latest) }}</template></p>
  </header>

  <p v-if="error" class="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>

  <router-link v-if="resume" :to="`/story/${resume.story.id}/read/${resume.no}`" class="mb-8 flex max-w-md items-center gap-4 rounded-xl border border-line bg-surface p-3 pr-5 transition-colors hover:border-primary">
    <div class="w-11 shrink-0"><BookCover :title="resume.story.title" :genre="resume.story.genre" :image="resume.story.coverImage" /></div>
    <div class="min-w-0">
      <div class="eyebrow">อ่านต่อ</div>
      <div class="truncate font-serif font-bold">{{ resume.story.title }}</div>
      <div class="muted text-sm">ตอนที่ {{ resume.no }}</div>
    </div>
    <ArrowRight class="ml-auto size-5 shrink-0" />
  </router-link>

  <div v-if="stories.length > 1" class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="relative flex-1">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg/60" aria-hidden="true" />
      <input ref="searchEl" v-model="query" type="text" inputmode="search" autocomplete="off" aria-label="ค้นหานิยาย" placeholder="ค้นหาชื่อเรื่อง แนว หรืออารมณ์"
        class="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-11 outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25" />
      <button v-if="query" type="button" class="absolute inset-y-0 right-0 grid w-11 place-items-center text-fg/60 hover:text-fg" aria-label="ล้างคำค้นหา" @click="query = ''"><X class="size-4" /></button>
    </div>
    <Segmented v-model="sort" :options="SORTS" label="เรียงลำดับ" class="sm:w-[26rem]" />
  </div>

  <div v-if="genres.length > 1 || myStories || hasAdult" class="mb-6 flex flex-wrap gap-2" role="group" aria-label="กรองตามแนว">
    <button type="button" :class="chip(genre === null && !mine)" @click="genre = null; mine = false">ทั้งหมด</button>
    <button v-if="myStories" type="button" :class="chip(mine)" :aria-pressed="mine" @click="mine = !mine">ติดตามแล้ว ({{ myStories }})</button>
    <button v-for="g in genres" :key="g" type="button" :class="chip(genre === g)" @click="genre = genre === g ? null : g">{{ g }}</button>
    <button v-if="hasAdult" type="button" :class="chip(hideAdult)" :aria-pressed="hideAdult" @click="hideAdult = !hideAdult">ไม่รวม 18+</button>
  </div>

  <div v-if="loading" class="shelf" aria-hidden="true"><div v-for="i in 4" :key="i" class="aspect-[2/3] animate-pulse rounded bg-fg/10" /></div>

  <div v-else-if="!shown.length && filtering" class="py-12 text-center">
    <div class="font-serif text-xl">ไม่พบเรื่องที่ตรงกับที่ค้นหา</div>
    <p class="muted mb-4 mt-2">ลองคำอื่น หรือเลือกแนวอื่น</p>
    <Button variant="outline" @click="clearFilters">ล้างตัวกรอง</Button>
  </div>

  <div v-else-if="!shown.length && !error" class="py-12 text-center">
    <div class="font-serif text-xl">ยังไม่มีนิยายที่เผยแพร่</div>
    <p class="muted mb-4 mt-2">เรื่องที่เผยแพร่แล้วจะขึ้นที่นี่</p>
    <Button v-if="auth.canWrite" to="/admin/stories">ไปสร้างเรื่องแรก</Button>
  </div>

  <div v-else class="shelf">
    <StoryCard v-for="s in shown" :key="s.id" :story="s" :badge="badge(s)" />
  </div>
</template>
