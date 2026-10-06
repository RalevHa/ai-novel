<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import Button from '../components/ui/Button.vue'
import { fmtDate, parseDb } from '../genre'
import { lsGet } from '../ls'
import { useAuth } from '../stores/auth'

const auth = useAuth()
const load = () => ok(client.api.stories.get())
type Story = Awaited<ReturnType<typeof load>>[number]
const stories = ref<Story[]>([]), loading = ref(true), error = ref(''), genre = ref<string | null>(null)

const genres = computed(() => [...new Set(stories.value.map(s => s.genre).filter(Boolean))])
const shown = computed(() => genre.value ? stories.value.filter(s => s.genre === genre.value) : stories.value)
const latest = computed(() => stories.value.map(s => parseDb(s.updatedAt)).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0])

// resume strip: signed in = what the account read most recently (any device), otherwise this browser's last read
const remote = ref<{ storyId: number; no: number }[]>([]) // newest first
const resume = computed(() => {
  const r = remote.value.find(p => stories.value.some(s => s.id === p.storyId))
  if (r) return { story: stories.value.find(s => s.id === r.storyId)!, no: r.no }
  try {
    const l = JSON.parse(lsGet('lastRead') || 'null')
    const s = l && stories.value.find(x => x.id === l.id)
    return s ? { story: s, no: l.no as number } : null
  } catch { return null }
})
const chip = (on: boolean) => ['inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors sm:min-h-9', on ? 'border-primary bg-primary text-on-primary' : 'border-line hover:bg-fg/5']

onMounted(async () => {
  try { stories.value = await load() } catch (e) { error.value = (e as Error).message }
  loading.value = false
  if (auth.user) remote.value = await ok(client.api.me.progress.get()).catch(() => [])
})
</script>

<template>
  <header class="mb-8">
    <h1 class="font-serif text-[clamp(28px,4.5vw,44px)] font-bold leading-tight">นิยายที่ AI แต่งไว้อ่านยามว่าง</h1>
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

  <div v-if="genres.length > 1" class="mb-6 flex flex-wrap gap-2" role="group" aria-label="กรองตามแนว">
    <button type="button" :class="chip(genre === null)" @click="genre = null">ทั้งหมด</button>
    <button v-for="g in genres" :key="g" type="button" :class="chip(genre === g)" @click="genre = g">{{ g }}</button>
  </div>

  <div v-if="loading" class="shelf" aria-hidden="true"><div v-for="i in 4" :key="i" class="aspect-[2/3] animate-pulse rounded bg-fg/10" /></div>

  <div v-else-if="!shown.length && !error" class="py-12 text-center">
    <div class="font-serif text-xl">ยังไม่มีนิยายที่เผยแพร่</div>
    <p class="muted mb-4 mt-2">เรื่องที่เผยแพร่แล้วจะขึ้นที่นี่</p>
    <Button v-if="auth.isAdmin" to="/admin/stories">ไปสร้างเรื่องแรก</Button>
  </div>

  <div v-else class="shelf">
    <router-link v-for="s in shown" :key="s.id" :to="`/story/${s.id}`" class="book">
      <BookCover :title="s.title" :genre="s.genre" :image="s.coverImage" />
      <div class="line-clamp-2 mt-3 font-serif font-bold leading-snug">{{ s.title }}</div>
      <div class="muted mt-1 text-xs">{{ s.chapterCount }} ตอน<template v-if="s.mood"> · {{ s.mood }}</template></div>
    </router-link>
  </div>
</template>
