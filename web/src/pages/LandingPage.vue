<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, BookOpen } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import StoryCard from '../components/StoryCard.vue'
import Button from '../components/ui/Button.vue'
import { parseDb } from '../genre'
import { isRecent, ratingScore } from '../shelf'
import { useAuth } from '../stores/auth'

// The front door: what the site is, a few real books to start with, how the stories come to be. Everything shown about the stories is
// read from the same list as the shelf, so there is nothing to keep up to date here.
const auth = useAuth()
const load = () => ok(client.api.stories.get())
type Story = Awaited<ReturnType<typeof load>>[number]
const stories = ref<Story[]>([]), loading = ref(true)

const time = (s: Story) => parseDb(s.updatedAt)?.getTime() || parseDb(s.createdAt)?.getTime() || 0
const latest = computed(() => [...stories.value].sort((a, b) => time(b) - time(a)).slice(0, 8))
const topRated = computed(() => stories.value.filter(s => s.ratingCount).sort((a, b) => ratingScore(b) - ratingScore(a) || b.ratingCount - a.ratingCount).slice(0, 8))
// the three books fanned out next to the title: the best rated once there are enough reviews, otherwise the newest
const featured = computed(() => (topRated.value.length >= 3 ? topRated.value : latest.value).slice(0, 3))
const chapterTotal = computed(() => stories.value.reduce((n, s) => n + s.chapterCount, 0))
const badge = (s: Story) => (s.status === 'completed' ? 'จบแล้ว' : isRecent(s.updatedAt) ? 'อัปเดตใหม่' : '')

// where each of the fanned books sits: the best one in the middle and in front
const SLOTS = [
  { left: '31%', top: '0%', width: '38%', turn: 0, z: 30 },
  { left: '3%', top: '13%', width: '34%', turn: -8, z: 10 },
  { left: '63%', top: '17%', width: '34%', turn: 8, z: 20 },
]

const STEPS = [
  { n: '一', title: 'วางเรื่อง', text: 'ผู้ดูแลหรือนักเขียนตั้งเรื่องย่อ ตัวละคร และทิศทางของเรื่อง' },
  { n: '二', title: 'AI เขียนเป็นตอน', text: 'AI เขียนตอนใหม่เป็นฉบับร่าง ผู้อ่านยังไม่เห็นจนกว่าจะมีคนกดเผยแพร่' },
  { n: '三', title: 'เผยแพร่ตามเวลา', text: 'เผยแพร่ทันที หรือตั้งเวลาให้ตอนขึ้นตามวันและเวลาที่ต้องการ แล้วแจ้งเตือนคนที่ติดตามเรื่องนั้น' },
]
const PERKS = [
  { title: 'อ่านสบายตา', text: 'เลือกธีมขาว ซีเปีย หรือมืด ปรับขนาดตัวอักษร ฟังเสียงอ่านออกเสียง ดาวน์โหลดเป็น EPUB หรือติดตามผ่าน RSS' },
  { title: 'ไม่มีโฆษณา ไม่ตามรอยคุณ', text: 'ไม่มีโฆษณาและไม่ใช้เครื่องมือติดตามของบุคคลที่สาม อ่านได้โดยไม่ต้องสมัคร' },
  { title: 'คุยกันได้', text: 'ให้ดาวรีวิวเรื่อง แสดงความคิดเห็นแต่ละตอน ตอบกลับ และโหวต เมื่อสมัครสมาชิก' },
]

onMounted(async () => {
  try { stories.value = await load() } catch { /* the page still works without the book rows */ }
  loading.value = false
})
</script>

<template>
  <!-- hero -->
  <section class="relative grid items-center gap-10 py-4 md:grid-cols-[1.1fr_.9fr] md:gap-8 md:py-12" aria-labelledby="hero-h">
    <span class="pointer-events-none absolute -top-4 right-0 hidden select-none font-mincho text-[200px] font-bold leading-none text-primary/[.06] [writing-mode:vertical-rl] lg:block" aria-hidden="true">物語</span>
    <div class="relative">
      <div class="eyebrow flex items-center gap-2.5"><span class="seal" aria-hidden="true" />นิยายที่ AI ช่วยแต่ง</div>
      <h1 id="hero-h" class="mt-5 font-serif text-[clamp(34px,6.2vw,60px)] font-bold leading-[1.18]">
        <span class="block">นิยายที่ AI แต่งไว้</span><span class="block text-primary">อ่านยามว่าง</span>
      </h1>
      <p class="mt-5 max-w-[46ch] text-lg leading-[1.8] text-fg/85">เรื่องสั้นและเรื่องยาวที่ออกเป็นตอน ๆ อ่านฟรี ไม่มีโฆษณา ปรับตัวอักษรให้สบายตา และมีแจ้งเตือนเมื่อเรื่องที่ติดตามมีตอนใหม่</p>
      <div class="mt-7 flex flex-wrap gap-3">
        <Button to="/story" size="lg"><BookOpen class="size-5" />เริ่มอ่าน</Button>
        <Button v-if="!auth.user" to="/register" variant="outline" size="lg">สมัครสมาชิก</Button>
        <Button v-else to="/following" variant="outline" size="lg">เรื่องที่ติดตาม</Button>
      </div>
      <p v-if="stories.length" class="muted mt-6 text-sm">{{ stories.length }} เรื่อง · {{ chapterTotal }} ตอน · นิยายทุกเรื่องเขียนโดย AI</p>
    </div>

    <!-- isolate: the covers' own z-index values (30/20/10) stay inside this box; they used to compete with the header (also z-30) and paint over its account menu -->
    <div class="relative isolate mx-auto aspect-[1.1] w-full max-w-[460px]">
      <template v-if="featured.length">
        <div v-for="(s, i) in featured" :key="s.id" class="absolute" :style="{ left: featured.length === 1 ? SLOTS[0].left : SLOTS[i].left, top: SLOTS[i].top, width: SLOTS[i].width, zIndex: SLOTS[i].z, transform: `rotate(${SLOTS[i].turn}deg)` }">
          <router-link :to="`/story/${s.id}`" class="book" :aria-label="s.title"><BookCover :title="s.title" :genre="s.genre" :image="s.coverImage" /></router-link>
        </div>
      </template>
      <div v-else-if="!loading" class="grid h-full place-items-center rounded-2xl border border-line bg-surface font-mincho text-7xl font-bold text-primary" aria-hidden="true">物語</div>
    </div>
  </section>

  <div class="space-y-16 pb-6 pt-8 md:space-y-20 md:pt-12">
    <!-- newest -->
    <section v-if="latest.length" aria-labelledby="new-h">
      <div class="mb-5 flex items-baseline gap-3">
        <span class="font-mincho text-2xl font-bold text-primary/70" aria-hidden="true">新着</span>
        <h2 id="new-h" class="font-serif text-2xl font-bold">อัปเดตล่าสุด</h2>
        <router-link to="/story" class="ml-auto inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline">ดูทั้งหมด<ArrowRight class="size-4" aria-hidden="true" /></router-link>
      </div>
      <div class="-mx-5 overflow-x-auto px-5 pb-3 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <div class="flex snap-x gap-5 md:grid md:grid-cols-6 md:[&>:nth-child(n+7)]:hidden">
          <StoryCard v-for="s in latest" :key="s.id" :story="s" :badge="badge(s)" class="w-[150px] shrink-0 snap-start md:w-auto" />
        </div>
      </div>
    </section>

    <!-- best rated: only once a few books have reviews -->
    <section v-if="topRated.length >= 3" aria-labelledby="top-h">
      <div class="mb-5 flex items-baseline gap-3">
        <span class="font-mincho text-2xl font-bold text-primary/70" aria-hidden="true">人気</span>
        <h2 id="top-h" class="font-serif text-2xl font-bold">คะแนนสูงสุดจากผู้อ่าน</h2>
      </div>
      <div class="-mx-5 overflow-x-auto px-5 pb-3 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <div class="flex snap-x gap-5 md:grid md:grid-cols-6 md:[&>:nth-child(n+7)]:hidden">
          <StoryCard v-for="s in topRated" :key="s.id" :story="s" class="w-[150px] shrink-0 snap-start md:w-auto" />
        </div>
      </div>
    </section>

    <!-- how a story comes to be -->
    <section aria-labelledby="how-h">
      <div class="mb-6 flex items-baseline gap-3">
        <span class="font-mincho text-2xl font-bold text-primary/70" aria-hidden="true">仕組</span>
        <h2 id="how-h" class="font-serif text-2xl font-bold">นิยายเกิดขึ้นอย่างไร</h2>
      </div>
      <ol class="grid gap-4 md:grid-cols-3">
        <li v-for="s in STEPS" :key="s.n" class="rounded-xl border border-line bg-surface p-6">
          <span class="block font-mincho text-5xl font-bold leading-none text-primary" aria-hidden="true">{{ s.n }}</span>
          <h3 class="mt-4 font-serif text-lg font-bold">{{ s.title }}</h3>
          <p class="mt-2 leading-[1.8] text-fg/80">{{ s.text }}</p>
        </li>
      </ol>
      <p class="muted mt-4 text-sm">AI อาจเขียนผิดพลาดหรือเล่าขัดกับตอนก่อนหน้าได้ อ่านรายละเอียดที่<router-link to="/about" class="text-primary underline underline-offset-2">เกี่ยวกับเรา</router-link></p>
    </section>

    <!-- why here -->
    <section aria-labelledby="why-h">
      <h2 id="why-h" class="sr-only">จุดเด่นของเว็บ</h2>
      <ul class="grid gap-x-10 gap-y-6 border-t border-line pt-8 md:grid-cols-3">
        <li v-for="p in PERKS" :key="p.title">
          <h3 class="font-serif text-lg font-bold">{{ p.title }}</h3>
          <p class="mt-2 leading-[1.8] text-fg/80">{{ p.text }}</p>
        </li>
      </ul>
    </section>

    <!-- writers -->
    <section class="rounded-2xl bg-primary px-6 py-10 text-on-primary sm:px-10" aria-labelledby="write-h">
      <h2 id="write-h" class="font-serif text-2xl font-bold">อยากเขียนนิยายกับ AI?</h2>
      <p class="mt-3 max-w-[56ch] leading-[1.8] opacity-90">นักเขียนจัดการเรื่องของตัวเองได้ครบ ตั้งแต่ให้ AI เขียนตอน ตรวจแก้ ไปจนถึงตั้งเวลาเผยแพร่ สิทธิ์นักเขียนมอบโดยผู้ดูแลระบบ</p>
      <div class="mt-6 flex flex-wrap gap-3">
        <router-link to="/guide" class="inline-flex h-11 items-center rounded-lg bg-surface px-5 font-medium text-fg transition-colors hover:bg-surface/90">ดูคู่มือสำหรับนักเขียน</router-link>
        <router-link to="/contact" class="inline-flex h-11 items-center rounded-lg border border-on-primary/50 px-5 font-medium transition-colors hover:bg-on-primary/10">ติดต่อขอสิทธิ์</router-link>
      </div>
    </section>
  </div>
</template>
