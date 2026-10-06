<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDownUp, BookOpen, Check, Download, Rss } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Modal from '../components/ui/Modal.vue'
import Pager from '../components/ui/Pager.vue'
import Tabs from '../components/ui/Tabs.vue'
import { imageUrl } from '../image'
import { fmtDate } from '../genre'
import { lsGet } from '../ls'
import { reads as loadReads } from '../readState'
import { setTitle } from '../title'
import { toast } from '../toast'
import { useAuth } from '../stores/auth'

const id = useRoute().params.id as string
const router = useRouter()
const auth = useAuth()
const load = () => ok(client.api.stories({ id: Number(id) }).get())
const story = ref<Awaited<ReturnType<typeof load>> | null>(null), loading = ref(true), error = ref(''), newestFirst = ref(false)
const tab = ref('toc')

// tapping a character opens a dialog with everything we know about them; the card only shows a teaser
type Character = NonNullable<typeof story.value>['characters'][number]
const picked = ref<Character | null>(null), pickedOpen = ref(false) // picked outlives the dialog so the text does not blank out while it fades
const showCharacter = (c: Character) => { picked.value = c; pickedOpen.value = true }

// chapters this reader has finished (account if signed in, otherwise this browser)
const readSet = ref<Set<number>>(new Set())
const readCount = computed(() => story.value?.chapters.filter(c => readSet.value.has(c.no)).length ?? 0)

const remoteLast = ref(0)
const last = computed(() => remoteLast.value || Number(lsGet(`last:${id}`)) || 0)
const nos = computed(() => story.value?.chapters.map(c => c.no) ?? [])
const startNo = computed(() => (nos.value.includes(last.value) ? last.value : nos.value[0]))
const SIZE = 50, tocPage = ref(1)
const all = computed(() => newestFirst.value ? [...(story.value?.chapters ?? [])].reverse() : story.value?.chapters ?? [])
const list = computed(() => all.value.slice((tocPage.value - 1) * SIZE, tocPage.value * SIZE))
// jump to a chapter by number (long stories)
const jumpNo = ref('')
function jump() {
  const n = Number(jumpNo.value)
  if (!nos.value.includes(n)) { toast(`ไม่มีตอนที่ ${jumpNo.value}`, 'error'); return }
  router.push(`/story/${id}/read/${n}`)
}

// phones: once the main buttons scroll away, a "continue reading" bar stays at the bottom
const cta = ref<HTMLElement | null>(null), ctaVisible = ref(true)
let io: IntersectionObserver | null = null
watch(cta, el => {
  io?.disconnect()
  if (el) { io = new IntersectionObserver(([e]) => { ctaVisible.value = e.isIntersecting }); io.observe(el) }
})
onBeforeUnmount(() => io?.disconnect())

const copyFeed = () => navigator.clipboard.writeText(`${location.origin}/api/stories/${id}/feed.xml`).then(() => toast('คัดลอกลิงก์ RSS แล้ว วางในแอปอ่าน feed ได้เลย'), () => toast('คัดลอกไม่สำเร็จ', 'error'))
const flip = () => { newestFirst.value = !newestFirst.value; tocPage.value = 1 }

onMounted(async () => {
  try { story.value = await load(); setTitle(story.value.title) } catch (e) { error.value = (e as Error).message }
  loading.value = false
  loadReads(Number(id)).then(s => { readSet.value = s })
  if (auth.user) remoteLast.value = (await ok(client.api.me.progress.get()).catch(() => [])).find(p => p.storyId === Number(id))?.no ?? 0
})
</script>

<template>
  <Bar v-if="loading" />
  <p v-if="error" class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>

  <div v-if="story" class="grid items-start gap-6 md:grid-cols-[230px_1fr] md:gap-12">
    <div class="w-[44vw] max-w-[190px] md:sticky md:top-[84px] md:w-auto md:max-w-none"><BookCover :title="story.title" :genre="story.genre" :image="story.coverImage" /></div>

    <div>
      <div class="eyebrow mb-2">{{ [story.genre, story.mood].filter(Boolean).join(' · ') || 'นิยาย' }}</div>
      <h1 class="font-serif text-[clamp(26px,4vw,38px)] font-bold leading-snug">{{ story.title }}</h1>
      <p class="mb-6 mt-4 max-w-[62ch] whitespace-pre-wrap leading-[1.85] text-fg/85">{{ story.synopsis }}</p>

      <div ref="cta" :class="[readCount ? 'mb-5' : 'mb-10', 'flex flex-wrap gap-3']">
        <Button v-if="startNo" size="lg" :to="`/story/${id}/read/${startNo}`"><BookOpen class="size-5" />{{ last ? `อ่านต่อตอนที่ ${startNo}` : `เริ่มอ่านตอนที่ ${startNo}` }}</Button>
        <Button v-if="nos.length > 1" variant="outline" size="lg" :to="`/story/${id}/read/${nos[nos.length - 1]}`">ตอนล่าสุด</Button>
        <Button v-if="nos.length" variant="ghost" size="lg" :href="`/api/stories/${id}/epub`"><Download class="size-5" />EPUB</Button>
        <Button v-if="nos.length" variant="ghost" size="lg" aria-label="คัดลอกลิงก์ RSS เพื่อติดตามตอนใหม่" @click="copyFeed"><Rss class="size-5" />RSS</Button>
      </div>

      <div v-if="readCount" class="mb-8 max-w-sm">
        <div class="muted mb-1.5 text-sm">อ่านแล้ว {{ readCount }}/{{ story.chapters.length }} ตอน</div>
        <div class="h-1.5 overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-label="ตอนที่อ่านแล้ว" aria-valuemin="0" :aria-valuenow="readCount" :aria-valuemax="story.chapters.length">
          <div class="h-full rounded-full bg-primary" :style="{ width: `${(readCount / story.chapters.length) * 100}%` }" />
        </div>
      </div>

      <Tabs v-if="story.characters.length" v-model="tab" class="mb-4"
        :items="[{ value: 'toc', label: `สารบัญ (${story.chapters.length})` }, { value: 'cast', label: `ตัวละคร (${story.characters.length})` }]" />

      <section v-if="tab === 'cast'" aria-label="ตัวละคร">
        <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <li v-for="c in story.characters" :key="c.id">
            <button type="button" class="block h-full w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25" @click="showCharacter(c)">
              <img v-if="c.image" :src="imageUrl(c.image)" :alt="`รูป ${c.name}`" class="aspect-[3/4] w-full object-cover" loading="lazy" decoding="async" />
              <div v-else class="grid aspect-[3/4] w-full place-items-center bg-secondary/15 font-serif text-5xl font-bold text-secondary" aria-hidden="true">{{ c.name.slice(0, 1) }}</div>
              <div class="p-3">
                <div class="font-serif font-bold leading-snug">{{ c.name }}</div>
                <div v-if="c.role" class="muted text-xs">{{ c.role }}</div>
                <p v-if="c.profile" class="muted mt-2 line-clamp-4 text-sm leading-relaxed">{{ c.profile }}</p>
              </div>
            </button>
          </li>
        </ul>
      </section>

      <Modal :open="pickedOpen" :title="picked?.name ?? ''" size="sm" @close="pickedOpen = false">
        <template v-if="picked">
          <div class="flex items-center gap-4">
            <img v-if="picked.image" :src="imageUrl(picked.image)" :alt="`รูป ${picked.name}`" class="aspect-[3/4] w-28 shrink-0 rounded-lg object-cover" decoding="async" />
            <div v-else class="grid aspect-[3/4] w-28 shrink-0 place-items-center rounded-lg bg-secondary/15 font-serif text-5xl font-bold text-secondary" aria-hidden="true">{{ picked.name.slice(0, 1) }}</div>
            <div v-if="picked.role" class="min-w-0">
              <div class="eyebrow">บทบาท</div>
              <div class="font-serif text-lg font-bold leading-snug">{{ picked.role }}</div>
            </div>
          </div>
          <p v-if="picked.profile" class="mt-4 whitespace-pre-wrap leading-[1.85] text-fg/90">{{ picked.profile }}</p>
          <p v-else class="muted mt-4 text-sm">ยังไม่มีรายละเอียดของตัวละครนี้</p>
        </template>
      </Modal>

      <div v-show="tab === 'toc'" class="mb-2 flex items-center">
        <h2 class="font-serif text-xl font-bold">สารบัญ <span class="muted text-sm font-normal">· {{ story.chapters.length }} ตอน</span></h2>
        <div class="flex-1" />
        <form v-if="story.chapters.length > 30" class="mr-2" @submit.prevent="jump">
          <label class="sr-only" for="jump">ไปตอนที่</label>
          <input id="jump" v-model="jumpNo" inputmode="numeric" pattern="[0-9]*" placeholder="ไปตอนที่…" class="h-11 w-28 rounded-lg border border-line bg-surface px-3 text-sm outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25 sm:h-9" />
        </form>
        <Button v-if="story.chapters.length > 1" variant="ghost" size="sm" @click="flip"><ArrowDownUp class="size-4" />{{ newestFirst ? 'ใหม่ไปเก่า' : 'เก่าไปใหม่' }}</Button>
      </div>

      <ol v-show="tab === 'toc'" class="border-t border-line">
        <li v-for="c in list" :key="c.no" class="border-b border-line">
          <router-link :to="`/story/${id}/read/${c.no}`" class="grid grid-cols-[32px_1fr_auto] items-baseline gap-3 px-2 py-3.5 hover:bg-primary/5 md:grid-cols-[44px_1fr_auto_auto]">
            <span class="tabular-nums text-fg/75">{{ c.no }}</span>
            <span class="min-w-0">
              <span :class="['font-serif', c.no === last && 'font-bold']">{{ c.title || `ตอนที่ ${c.no}` }}</span>
              <template v-if="readSet.has(c.no)"><Check class="ml-1.5 inline size-4 align-[-2px] text-primary" aria-hidden="true" /><span class="sr-only"> (อ่านแล้ว)</span></template>
              <span class="muted mt-0.5 block text-xs md:hidden">{{ fmtDate(c.createdAt) }}</span>
            </span>
            <span v-if="c.no === last" class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">อ่านล่าสุด</span><span v-else />
            <span class="muted hidden text-xs md:inline">{{ fmtDate(c.createdAt) }}</span>
          </router-link>
        </li>
        <li v-if="!list.length" class="muted py-4">ยังไม่มีตอนที่เผยแพร่</li>
      </ol>
      <Pager v-show="tab === 'toc'" v-model="tocPage" :size="SIZE" :total="all.length" />
    </div>
  </div>

  <template v-if="story && startNo && !ctaVisible">
    <div class="h-20 md:hidden" aria-hidden="true" />
    <div class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <Button size="lg" class="w-full" :to="`/story/${id}/read/${startNo}`"><BookOpen class="size-5" />{{ last ? `อ่านต่อตอนที่ ${startNo}` : `เริ่มอ่านตอนที่ ${startNo}` }}</Button>
    </div>
  </template>
</template>
