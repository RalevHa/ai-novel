<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/vue'
import { ChevronLeft, ChevronRight, List, Pause, Play, Square, Type, Volume2 } from 'lucide-vue-next'
import { client, ok } from '../api'
import ChapterSelect from '../components/ChapterSelect.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Segmented from '../components/ui/Segmented.vue'
import { stripChapterPrefix } from '../genre'
import { RATES, useSpeech } from '../tts'
import { toast } from '../toast'
import { renderChapter } from '../markdown'
import { lsGet, lsSet } from '../ls'
import { useAuth } from '../stores/auth'
import { setTheme, theme, THEMES, type ThemeName } from '../theme'

const route = useRoute(), router = useRouter(), auth = useAuth()
const id = computed(() => route.params.id as string)
const no = computed(() => Number(route.params.no))

const chapter = ref<{ no: number; title: string; content: string } | null>(null)
const storyTitle = ref('')
const list = ref<{ no: number; title: string }[]>([]) // published chapters, for prev/next and the picker (drafts leave gaps)
const nos = computed(() => list.value.map(c => c.no))
const loading = ref(true), error = ref(''), progress = ref(0)

const size = ref(Number(lsGet('fontSize')) || 19)
const face = ref<'serif' | 'sans'>(lsGet('fontFace') === 'sans' ? 'sans' : 'serif')
watch(size, v => lsSet('fontSize', String(v)))
watch(face, v => lsSet('fontFace', v))
const faces = [{ k: 'serif', n: 'มีหัว' }, { k: 'sans', n: 'ไม่มีหัว' }] as const

const idx = computed(() => nos.value.indexOf(no.value))
const prev = computed(() => idx.value > 0 ? nos.value[idx.value - 1] : null)
const next = computed(() => idx.value >= 0 && idx.value < nos.value.length - 1 ? nos.value[idx.value + 1] : null)

// read aloud: when a chapter ends, carry on with the next one (the listener started it, so the browser allows it)
const article = ref<HTMLElement | null>(null)
const speech = useSpeech()
let resume = false
function listen() {
  if (!speech.play(article.value?.innerText ?? '', () => { if (next.value) { resume = true; go(next.value) } })) toast('อุปกรณ์นี้ไม่มีเสียงอ่านภาษาไทย', 'error')
}

const html = computed(() => renderChapter(chapter.value?.content ?? '', chapter.value?.title ?? ''))
const label = computed(() => stripChapterPrefix(chapter.value?.title ?? ''))

watch(() => [id.value, no.value], async () => {
  speech.stop()
  loading.value = true; error.value = ''
  try {
    const [c, s] = await Promise.all([
      ok(client.api.stories({ id: Number(id.value) }).chapters({ no: no.value }).get()),
      ok(client.api.stories({ id: Number(id.value) }).get()),
    ])
    chapter.value = c
    storyTitle.value = s.title
    list.value = s.chapters
    lsSet(`last:${id.value}`, String(no.value))
    lsSet('lastRead', JSON.stringify({ id: Number(id.value), no: no.value }))
    if (auth.user) client.api.me.progress({ id: Number(id.value) }).put({ no: no.value }).catch(() => {}) // follows the reader across devices
    document.title = `${s.title} · ตอนที่ ${no.value}`
    scrollTo(0, 0)
  } catch (e) { error.value = (e as Error).message }
  loading.value = false
  if (resume) { resume = false; await nextTick(); listen() }
}, { immediate: true })

const go = (n: number | null | undefined) => n && router.push(`/story/${id.value}/read/${n}`)
const onScroll = () => { const h = document.documentElement; progress.value = Math.min(100, (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100) }
const onKey = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey) return
  if (e.key === 'ArrowLeft') go(prev.value)
  if (e.key === 'ArrowRight') go(next.value)
}
onMounted(() => { addEventListener('scroll', onScroll, { passive: true }); addEventListener('keydown', onKey) })
onBeforeUnmount(() => { removeEventListener('scroll', onScroll); removeEventListener('keydown', onKey); document.title = 'AI Novel · นิยายที่ AI แต่งไว้อ่าน' })
</script>

<template>
  <div class="fixed left-0 top-0 z-[70] h-[3px] bg-primary transition-[width] duration-100 ease-linear motion-reduce:transition-none" :style="{ width: progress + '%' }" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100" aria-label="ความคืบหน้าในตอน" />
  <Bar v-if="loading" />
  <p v-if="error" class="mx-auto max-w-[680px] rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>

  <div v-if="chapter" class="mx-auto max-w-[680px] pb-6" :style="{ '--reader-size': size + 'px' }">
    <div class="mb-8 flex items-center">
      <Button variant="ghost" :to="`/story/${id}`" class="-ml-3 px-3" aria-label="สารบัญ"><List class="size-5" /><span class="hidden sm:inline">สารบัญ</span></Button>
      <ChapterSelect :chapters="list" :model-value="no" class="mx-2 max-w-[300px] flex-1" @update:model-value="go" />
      <template v-if="speech.supported">
        <Button v-if="!speech.speaking.value" variant="ghost" class="px-3" aria-label="ฟังเสียงอ่าน" @click="listen"><Volume2 class="size-5" /><span class="hidden sm:inline">ฟัง</span></Button>
        <template v-else>
          <Button variant="ghost" size="icon" :aria-label="speech.paused.value ? 'อ่านต่อ' : 'พัก'" @click="speech.toggle"><Play v-if="speech.paused.value" class="size-5" /><Pause v-else class="size-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="หยุดอ่าน" @click="speech.stop"><Square class="size-4" /></Button>
        </template>
      </template>
      <Popover class="relative">
        <PopoverButton as="template"><Button variant="ghost" class="px-3" aria-label="ตัวอักษร"><Type class="size-5" /><span class="hidden sm:inline">ตัวอักษร</span></Button></PopoverButton>
        <PopoverPanel class="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-line bg-surface p-4 shadow-lg">
          <div class="eyebrow mb-2">ธีม</div>
          <Segmented :model-value="theme" :options="THEMES" label="ธีม" class="mb-4" @update:model-value="setTheme($event as ThemeName)" />
          <div class="eyebrow mb-2">แบบอักษร</div>
          <Segmented v-model="face" :options="faces" label="แบบอักษร" class="mb-4" />
          <label class="eyebrow mb-1 block" for="size">ขนาด {{ size }}</label>
          <input id="size" v-model.number="size" type="range" min="15" max="30" step="1" class="mb-4 w-full accent-primary" />
          <template v-if="speech.supported">
            <div class="eyebrow mb-2">ความเร็วเสียงอ่าน</div>
            <Segmented :model-value="speech.rate.value" :options="RATES" label="ความเร็วเสียงอ่าน" @update:model-value="speech.setRate($event as string)" />
          </template>
        </PopoverPanel>
      </Popover>
    </div>

    <header class="mb-10">
      <div class="eyebrow">{{ storyTitle }} · ตอนที่ {{ chapter.no }}</div>
      <h1 class="mt-2 font-serif text-[clamp(26px,4vw,34px)] font-bold leading-snug">{{ label || `ตอนที่ ${chapter.no}` }}</h1>
    </header>

    <article ref="article" class="reader-body" :class="face" v-html="html" />

    <nav class="mt-14 space-y-3 border-t border-line pt-6" aria-label="เปลี่ยนตอน">
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" :disabled="!prev" @click="go(prev)"><ChevronLeft class="size-5" />ตอนก่อนหน้า</Button>
        <Button class="flex-1" :disabled="!next" @click="go(next)">ตอนถัดไป<ChevronRight class="size-5" /></Button>
      </div>
      <div class="flex items-center gap-2">
        <ChapterSelect :chapters="list" :model-value="no" class="flex-1" @update:model-value="go" />
        <Button variant="ghost" :to="`/story/${id}`">สารบัญ</Button>
      </div>
    </nav>
    <p v-if="!next" class="muted mt-4 text-center text-xs">นี่คือตอนล่าสุด</p>
    <p class="muted mt-1 hidden text-center text-xs md:block">ใช้ปุ่มลูกศรซ้ายและขวาบนคีย์บอร์ดเพื่อเปลี่ยนตอน</p>
  </div>
</template>
