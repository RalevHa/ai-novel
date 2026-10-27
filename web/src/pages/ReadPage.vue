<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/vue'
import { ArrowUp, BookmarkCheck, BookmarkPlus, ChevronLeft, ChevronRight, Heart, List, MessageSquare, Pause, Play, Square, Type, Volume2 } from 'lucide-vue-next'
import { client, ok } from '../api'
import ChapterSelect from '../components/ChapterSelect.vue'
import AgeGate from '../components/AgeGate.vue'
import CommentSection from '../components/CommentSection.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Modal from '../components/ui/Modal.vue'
import Segmented from '../components/ui/Segmented.vue'
import { stripChapterPrefix } from '../genre'
import { FINISHED, READ_AT, RESTORE_MIN, scrollFraction, scrollTarget } from '../readPos'
import { chromeHidden, INDENT_OPTIONS, LEADING_OPTIONS, leadingValue, MEASURE_OPTIONS, MEASURES, PARA_OPTIONS, paraValue, readingMinutes, isCenterTap, swipeDir, type Indent, type Leading, type Measure, type Para } from '../reader'
import { countFinish, countView, flush, getPos, markRead, savePos } from '../readState'
import { setTitle } from '../title'
import { RATES, useSpeech } from '../tts'
import { toast } from '../toast'
import { renderChapter } from '../markdown'
import { lsGet, lsSet } from '../ls'
import { savePrefs } from '../prefs'
import { confirmedAge, needsGate, type ContentRating } from '../rating'
import { useAuth } from '../stores/auth'
import { setTheme, theme, THEMES, type ThemeName } from '../theme'

const route = useRoute(), router = useRouter()
const auth = useAuth()
const id = computed(() => route.params.id as string)
const no = computed(() => Number(route.params.no))

const chapter = ref<{ no: number; title: string; content: string } | null>(null)
const storyTitle = ref('')
// a 15+/18+ story asks the reader to confirm their age before showing (or counting) anything
const contentRating = ref<ContentRating>('general'), warnings = ref('')
const gated = computed(() => needsGate(contentRating.value, confirmedAge.value, auth.canWrite))
const list = ref<{ no: number; title: string }[]>([]) // published chapters, for prev/next and the picker (drafts leave gaps)
const nos = computed(() => list.value.map(c => c.no))
const loading = ref(true), error = ref(''), progress = ref(0)

const size = ref(Number(lsGet('fontSize')) || 19)
const face = ref<'serif' | 'sans'>(lsGet('fontFace') === 'sans' ? 'sans' : 'serif')
watch(size, v => { lsSet('fontSize', String(v)); savePrefs() })
watch(face, v => { lsSet('fontFace', v); savePrefs() })
const faces = [{ k: 'serif', n: 'มีหัว' }, { k: 'sans', n: 'ไม่มีหัว' }] as const
// text column width and line spacing, remembered like the font settings
const stored = <T extends string>(key: string, ok: (v: string) => boolean, fallback: T) => { const v = lsGet(key); return v && ok(v) ? v as T : fallback }
const measure = ref<Measure>(stored('readerWidth', v => v in MEASURES, 'normal'))
const leading = ref<Leading>(stored('readerLeading', v => ['tight', 'normal', 'loose'].includes(v), 'normal'))
watch(measure, v => { lsSet('readerWidth', v); savePrefs() })
watch(leading, v => { lsSet('readerLeading', v); savePrefs() })
const para = ref<Para>(stored('readerPara', v => ['tight', 'normal', 'loose'].includes(v), 'normal'))
const indent = ref<Indent>(stored('readerIndent', v => v === 'on' || v === 'off', 'off'))
watch(para, v => { lsSet('readerPara', v); savePrefs() })
watch(indent, v => { lsSet('readerIndent', v); savePrefs() })

const idx = computed(() => nos.value.indexOf(no.value))
const prev = computed(() => idx.value > 0 ? nos.value[idx.value - 1] : null)
const next = computed(() => idx.value >= 0 && idx.value < nos.value.length - 1 ? nos.value[idx.value + 1] : null)

// bottom bar: bookmark this chapter (the story's marked chapter numbers load once per story), jump to the (folded) comments
const marked = ref(new Set<number>())
watch([id, () => auth.user], async () => {
  marked.value = new Set()
  if (auth.user) try { marked.value = new Set(await ok(client.api.me['chapter-bookmarks']({ id: id.value }).get())) } catch { /* the button just shows unmarked */ }
}, { immediate: true })
async function bookmark() {
  if (!auth.user) { toast('เข้าสู่ระบบก่อนจึงจะบุ๊กมาร์กตอนได้'); router.push({ path: '/login', query: { next: route.fullPath } }); return }
  const n = no.value, on = !marked.value.has(n), set = (v: boolean) => { const s = new Set(marked.value); v ? s.add(n) : s.delete(n); marked.value = s }
  set(on)
  try {
    const ch = client.api.me['chapter-bookmarks']({ id: id.value })({ no: n })
    await ok(on ? ch.put() : ch.delete())
    toast(on ? 'บุ๊กมาร์กตอนนี้แล้ว' : 'เอาบุ๊กมาร์กออกแล้ว')
  } catch (e) { set(!on); toast((e as Error).message, 'error') }
}
// likes on this chapter; the heart flips at once and is put back if the server refuses
const likes = ref({ count: 0, liked: false })
watch([id, no], async () => {
  likes.value = { count: 0, liked: false }
  try { likes.value = await ok(client.api.stories({ id: id.value }).chapters({ no: no.value }).likes.get()) } catch { /* the heart just shows 0 */ }
}, { immediate: true })
async function like() {
  if (!auth.user) { toast('เข้าสู่ระบบก่อนจึงจะกดถูกใจได้'); router.push({ path: '/login', query: { next: route.fullPath } }); return }
  const before = likes.value, on = !before.liked
  likes.value = { count: before.count + (on ? 1 : -1), liked: on }
  try {
    const ch = client.api.stories({ id: id.value }).chapters({ no: no.value })
    likes.value = await ok(on ? ch.like.put() : ch.like.delete())
  } catch (e) { likes.value = before; toast((e as Error).message, 'error') }
}
const commentsOpen = ref(false) // comments in a sheet over the page, so the reader's place in the text is never moved

// read aloud: when a chapter ends, carry on with the next one (the listener started it, so the browser allows it)
const article = ref<HTMLElement | null>(null)
const speech = useSpeech()
let resume = false
function listen() {
  if (!speech.play(article.value?.innerText ?? '', () => { if (next.value) { resume = true; go(next.value) } })) toast('อุปกรณ์นี้ไม่มีเสียงอ่านภาษาไทย', 'error')
}

const html = computed(() => renderChapter(chapter.value?.content ?? '', chapter.value?.title ?? ''))
const label = computed(() => stripChapterPrefix(chapter.value?.title ?? ''))
const minutes = computed(() => readingMinutes(chapter.value?.content ?? ''))
const nextTitle = computed(() => { const c = list.value.find(x => x.no === next.value); return c ? stripChapterPrefix(c.title) || `ตอนที่ ${c.no}` : '' })

watch(() => [id.value, no.value], async () => {
  speech.stop()
  loading.value = true; error.value = ''
  try {
    const [c, s] = await Promise.all([
      ok(client.api.stories({ id: Number(id.value) }).chapters({ no: no.value }).get()),
      ok(client.api.stories({ id: Number(id.value) }).get()),
    ])
    chapter.value = c
    storyTitle.value = s.title; contentRating.value = s.contentRating; warnings.value = s.warnings
    list.value = s.chapters
    lsSet(`last:${id.value}`, String(no.value))
    lsSet('lastRead', JSON.stringify({ id: Number(id.value), no: no.value }))
    setTitle(`${s.title} · ตอนที่ ${no.value}`)
    loading.value = false
    await nextTick() // the new text must be in the page before we can scroll into it
    if (!gated.value) await startReading(Number(id.value), no.value)
  } catch (e) { error.value = (e as Error).message }
  loading.value = false
  if (resume) { resume = false; await nextTick(); listen() }
}, { immediate: true })

watch(gated, async g => { if (!g && chapter.value) { await nextTick(); await startReading(Number(id.value), no.value) } }) // the reader just confirmed

// ---- remembering where the reader is (position in the chapter, and which chapters are finished)
const resumed = ref(false) // the "continuing where you left off" notice
let tracking = false, markedRead = false, userMoved = false, ro: ResizeObserver | null = null, notice: ReturnType<typeof setTimeout> | undefined
const movedByUser = () => { userMoved = true }
// Progress (the bar, the saved position, "finished") is measured against the chapter, not the whole page: the comments sit below it and
// opening them makes the page much taller, which must not change the percentage. They start where the section starts.
const readHeight = () => { const c = document.querySelector('[data-comments]'); return c ? c.getBoundingClientRect().top + scrollY : document.documentElement.scrollHeight }
const sid = () => Number(id.value)

async function startReading(storyId: number, chapterNo: number) {
  tracking = markedRead = userMoved = resumed.value = false
  setChrome(false); lastY = 0
  ro?.disconnect(); clearTimeout(notice)
  const doc = document.documentElement
  const saved = await getPos(storyId, chapterNo)
  if (storyId !== sid() || chapterNo !== no.value) return // the reader moved on while we waited
  if (saved >= RESTORE_MIN && saved < FINISHED && route.query.comments !== '1') { // coming from a notification: the comments are the destination, not the old position
    const apply = () => scrollTo(0, scrollTarget(saved, readHeight(), doc.clientHeight))
    apply()
    resumed.value = true; notice = setTimeout(() => { resumed.value = false }, 7000)
    // images and fonts settle after the first paint and move the target: follow until the reader takes over
    ro = new ResizeObserver(() => { if (!userMoved) apply() }); ro.observe(document.body)
    setTimeout(() => { ro?.disconnect(); tracking = true }, 1200)
  } else {
    scrollTo(0, 0)
    tracking = true
  }
  savePos(storyId, chapterNo, saved < FINISHED ? saved : 0, true) // records which chapter the reader is on
  countView(storyId, chapterNo)
  if (doc.scrollHeight <= doc.clientHeight + 4 || endVisible()) finish(storyId, chapterNo) // the whole text is already on screen: nothing left to read
}
// the last line of the text is on screen (the page also has the next-chapter card and footer below it, so this comes before the page's own end)
const endVisible = () => { const a = article.value; return !!a && a.getBoundingClientRect().bottom <= innerHeight + 24 }
function finish(storyId: number, chapterNo: number) {
  if (markedRead) return
  markedRead = true
  markRead(storyId, chapterNo)
  countFinish(storyId, chapterNo)
}
function restartFromTop() {
  userMoved = true; ro?.disconnect(); resumed.value = false
  scrollTo({ top: 0 })
  savePos(sid(), no.value, 0, true)
}

const go = (n: number | null | undefined) => {
  if (n && n === next.value) finish(sid(), no.value) // moving on counts as having read it
  return n && router.push(`/story/${id.value}/read/${n}`)
}
// focus mode: the site header slides away while reading down and comes back on the way up
let lastY = 0, hidden = false
const showTop = ref(false)
function setChrome(hide: boolean) {
  hidden = hide
  if (hide) {
    // scrolling on means the reader is done with the header and toolbar: close their open menus (toggling the button) and drop focus, or :focus-within keeps them showing
    const bars = '.site-header, .reader-bar'
    document.querySelectorAll<HTMLElement>('.site-header [aria-expanded="true"], .reader-bar [aria-expanded="true"]').forEach(b => b.click())
    setTimeout(() => { if (document.activeElement?.closest(bars)) (document.activeElement as HTMLElement).blur() }) // after the menus hand focus back to their button
    document.documentElement.dataset.chrome = 'hidden'
  } else delete document.documentElement.dataset.chrome
}
const backToTop = () => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

const onScroll = () => {
  const h = document.documentElement
  const f = scrollFraction(h.scrollTop, readHeight(), h.clientHeight)
  progress.value = f * 100
  const hide = chromeHidden(hidden, h.scrollTop, h.scrollTop - lastY)
  lastY = h.scrollTop
  if (hide !== hidden) setChrome(hide)
  showTop.value = h.scrollTop > innerHeight * 1.5
  if (!tracking) return
  savePos(sid(), no.value, f >= FINISHED ? 0 : f) // a finished chapter reopens at the top
  if (f >= READ_AT || endVisible()) finish(sid(), no.value)
}
// swipe left / right to change chapter, tap the middle to toggle the bars (touch screens); ignores gestures that start on controls or while text is selected
let touchStart: { x: number; y: number } | null = null
const onTouchStart = (e: TouchEvent) => {
  const t = e.touches[0]
  touchStart = e.touches.length === 1 && !(e.target as HTMLElement).closest('input, textarea, select, button, a, figure, .site-header, .reader-bar, .reader-foot, [data-comments], [role=listbox], [role=dialog], [contenteditable]') ? { x: t.clientX, y: t.clientY } : null
}
const onTouchEnd = (e: TouchEvent) => {
  const s = touchStart; touchStart = null
  if (!s || getSelection()?.toString()) return
  const t = e.changedTouches[0]
  const dx = t.clientX - s.x, dy = t.clientY - s.y
  if (isCenterTap(dx, dy, s.x, innerWidth)) { setChrome(!hidden); return } // tap the middle: bring the bars back (or put them away)
  const d = swipeDir(dx, dy, s.x, innerWidth)
  if (d) go(d > 0 ? next.value : prev.value)
}
const onHide = () => { if (document.visibilityState === 'hidden') flush() }
const onKey = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || commentsOpen.value) return
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) userMoved = true
  if (e.key === 'ArrowLeft') go(prev.value)
  if (e.key === 'ArrowRight') go(next.value)
}
onMounted(() => {
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('keydown', onKey)
  for (const ev of ['wheel', 'touchmove']) addEventListener(ev, movedByUser, { passive: true })
  addEventListener('touchstart', onTouchStart, { passive: true }); addEventListener('touchend', onTouchEnd, { passive: true })
  addEventListener('visibilitychange', onHide); addEventListener('pagehide', flush)
})
onBeforeUnmount(() => {
  removeEventListener('scroll', onScroll); removeEventListener('keydown', onKey)
  for (const ev of ['wheel', 'touchmove']) removeEventListener(ev, movedByUser)
  removeEventListener('touchstart', onTouchStart); removeEventListener('touchend', onTouchEnd)
  setChrome(false)
  removeEventListener('visibilitychange', onHide); removeEventListener('pagehide', flush)
  ro?.disconnect(); clearTimeout(notice); flush()
})
</script>

<template>
  <div class="fixed left-0 top-0 z-[70] h-[3px] bg-primary transition-[width] duration-100 ease-linear motion-reduce:transition-none" :style="{ width: progress + '%' }" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100" aria-label="ความคืบหน้าในตอน" />
  <Bar v-if="loading" />
  <p v-if="error" class="mx-auto max-w-[680px] rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>

  <AgeGate v-if="chapter && gated" :rating="contentRating" :warnings="warnings" />
  <div v-else-if="chapter" class="mx-auto max-w-[var(--reader-w,680px)] pb-20" :style="{ '--reader-size': size + 'px', '--reader-w': MEASURES[measure] + 'px', '--reader-lh': leadingValue(leading, face), '--reader-para': paraValue(para) + 'em', '--reader-indent': indent === 'on' ? '2em' : '0' }">
    <div class="reader-bar sticky top-[60px] z-20 mb-6 flex items-center bg-bg py-2">
      <Button variant="ghost" :to="`/story/${id}`" class="-ml-3 px-3" aria-label="สารบัญ"><List class="size-5" /><span class="hidden sm:inline">สารบัญ</span></Button>
      <ChapterSelect :chapters="list" :model-value="no" class="mx-2 max-w-[300px] flex-1" @update:model-value="go" />
      <template v-if="speech.supported">
        <Button v-if="!speech.speaking.value" variant="ghost" class="px-3" @click="listen"><Volume2 class="size-5" /><span class="sr-only sm:hidden">ฟังเสียงอ่าน</span><span class="hidden sm:inline">ฟัง</span></Button>
        <template v-else>
          <Button variant="ghost" size="icon" :aria-label="speech.paused.value ? 'อ่านต่อ' : 'พัก'" @click="speech.toggle"><Play v-if="speech.paused.value" class="size-5" /><Pause v-else class="size-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="หยุดอ่าน" @click="speech.stop"><Square class="size-4" /></Button>
        </template>
      </template>
      <Popover class="relative">
        <PopoverButton as="template"><Button variant="ghost" class="px-3" aria-label="ตัวอักษร"><Type class="size-5" /><span class="hidden sm:inline">ตัวอักษร</span></Button></PopoverButton>
        <PopoverPanel class="absolute right-0 z-40 mt-1 max-h-[calc(100dvh-13rem)] w-72 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-4 shadow-lg">
          <div class="eyebrow mb-2">ธีม</div>
          <Segmented :model-value="theme" :options="THEMES" label="ธีม" class="mb-4" @update:model-value="setTheme($event as ThemeName)" />
          <div class="eyebrow mb-2">แบบอักษร</div>
          <Segmented v-model="face" :options="faces" label="แบบอักษร" class="mb-4" />
          <label class="eyebrow mb-1 block" for="size">ขนาด {{ size }}</label>
          <input id="size" v-model.number="size" type="range" min="15" max="30" step="1" class="mb-4 w-full accent-primary" />
          <div class="eyebrow mb-2">ความกว้างบรรทัด</div>
          <Segmented :model-value="measure" :options="MEASURE_OPTIONS" label="ความกว้างบรรทัด" class="mb-4" @update:model-value="measure = $event as Measure" />
          <div class="eyebrow mb-2">ระยะห่างบรรทัด</div>
          <Segmented :model-value="leading" :options="LEADING_OPTIONS" label="ระยะห่างบรรทัด" class="mb-4" @update:model-value="leading = $event as Leading" />
          <div class="eyebrow mb-2">ระยะห่างย่อหน้า</div>
          <Segmented :model-value="para" :options="PARA_OPTIONS" label="ระยะห่างย่อหน้า" class="mb-4" @update:model-value="para = $event as Para" />
          <div class="eyebrow mb-2">ย่อหน้า</div>
          <Segmented :model-value="indent" :options="INDENT_OPTIONS" label="ย่อหน้า" class="mb-4" @update:model-value="indent = $event as Indent" />
          <template v-if="speech.supported">
            <div class="eyebrow mb-2">ความเร็วเสียงอ่าน</div>
            <Segmented :model-value="speech.rate.value" :options="RATES" label="ความเร็วเสียงอ่าน" @update:model-value="speech.setRate($event as string)" />
          </template>
        </PopoverPanel>
      </Popover>
    </div>

    <header class="mb-10">
      <div class="eyebrow">{{ storyTitle }} · ตอนที่ {{ chapter.no }} · อ่านประมาณ {{ minutes }} นาที</div>
      <h1 class="mt-2 font-serif text-[clamp(26px,4vw,34px)] font-bold leading-snug">{{ label || `ตอนที่ ${chapter.no}` }}</h1>
    </header>

    <article ref="article" class="reader-body" :class="face" v-html="html" />

    <router-link v-if="next" :to="`/story/${id}/read/${next}`" class="mt-14 block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-primary" @click="finish(sid(), no)">
      <div class="eyebrow">ตอนถัดไป</div>
      <div class="mt-1 flex items-center gap-3 font-serif text-lg font-bold leading-snug"><span class="min-w-0 flex-1">ตอนที่ {{ next }}: {{ nextTitle }}</span><ChevronRight class="size-5 shrink-0" aria-hidden="true" /></div>
    </router-link>

    <nav :class="[next ? 'mt-4' : 'mt-14', 'space-y-3 border-t border-line pt-6']" aria-label="เปลี่ยนตอน">
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" :disabled="!prev" @click="go(prev)"><ChevronLeft class="size-5" />ตอนก่อนหน้า</Button>
        <Button variant="outline" class="flex-1" :to="`/story/${id}`"><List class="size-5" />สารบัญ</Button>
      </div>
    </nav>
    <p v-if="!next" class="muted mt-4 text-center text-xs">นี่คือตอนล่าสุด</p>
    <p class="muted mt-1 hidden text-center text-xs md:block">ใช้ปุ่มลูกศรซ้ายและขวาบนคีย์บอร์ดเพื่อเปลี่ยนตอน</p>
    <CommentSection :key="`${id}-${no}`" :story-id="Number(id)" :no="no" collapsible :auto-open="route.query.comments === '1'" />
  </div>

  <!-- bottom bar: previous / current chapter / next; slides away with the header while reading down -->
  <nav v-if="chapter && !gated" class="reader-foot fixed inset-x-0 bottom-0 z-30 h-14 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="เปลี่ยนตอน (แถบล่าง)">
    <div class="mx-auto grid h-14 max-w-xl grid-cols-[1fr_auto_1fr] items-center px-2">
      <div class="flex items-center justify-start">
        <Button variant="ghost" class="gap-1 px-2" :aria-pressed="likes.liked" :aria-label="likes.liked ? `เลิกถูกใจตอนนี้ (${likes.count})` : `ถูกใจตอนนี้ (${likes.count})`" @click="like"><Heart class="size-5" :class="likes.liked && 'fill-danger text-danger'" /><span class="min-w-[1ch] text-sm tabular-nums">{{ likes.count }}</span></Button>
        <Button variant="ghost" size="icon" aria-label="ความคิดเห็น" @click="commentsOpen = true"><MessageSquare class="size-5" /></Button>
      </div>
      <div class="flex items-center">
        <Button variant="ghost" size="icon" :disabled="!prev" aria-label="ตอนก่อนหน้า" @click="go(prev)"><ChevronLeft class="size-6" /></Button>
        <span class="min-w-16 px-1 text-center text-sm font-medium" aria-live="polite">ตอนที่ {{ no }}</span>
        <Button variant="ghost" size="icon" :disabled="!next" aria-label="ตอนถัดไป" @click="go(next)"><ChevronRight class="size-6" /></Button>
      </div>
      <div class="flex items-center justify-end">
        <Button variant="ghost" size="icon" :aria-pressed="marked.has(no)" :aria-label="marked.has(no) ? 'เอาบุ๊กมาร์กตอนนี้ออก' : 'บุ๊กมาร์กตอนนี้'" @click="bookmark"><BookmarkCheck v-if="marked.has(no)" class="size-5 text-primary" /><BookmarkPlus v-else class="size-5" /></Button>
      </div>
    </div>
  </nav>

  <button v-if="showTop" type="button" class="fixed bottom-20 right-4 z-10 grid size-11 place-items-center rounded-full border border-line bg-surface shadow-lg" aria-label="กลับขึ้นบน" @click="backToTop"><ArrowUp class="size-5" /></button>

  <Modal :open="commentsOpen" title="ความคิดเห็น" size="lg" @close="commentsOpen = false">
    <CommentSection :story-id="Number(id)" :no="no" class="!mt-0" />
  </Modal>

  <div v-if="resumed" role="status" class="fixed inset-x-4 bottom-20 z-10 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lg">
    <span class="flex-1">อ่านต่อจากที่ค้างไว้</span>
    <Button size="sm" variant="outline" @click="restartFromTop">เริ่มจากต้นตอน</Button>
  </div>
</template>
