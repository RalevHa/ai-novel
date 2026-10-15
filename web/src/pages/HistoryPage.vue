<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Modal from '../components/ui/Modal.vue'
import { fmtDateTime } from '../genre'
import { lsGet } from '../ls'
import { toast, toastError } from '../toast'

// Reading history: every story this account has opened, newest first, with the chapter it stopped at. Stories that are no longer published drop out.
const load = () => ok(client.api.stories.get())
type Story = Awaited<ReturnType<typeof load>>[number]
const rows = ref<{ story: Story; no: number; title: string | null; at: string | Date | null }[]>([]), loading = ref(true), error = ref('')

const total = computed(() => rows.value.length)

// the browser's own "last read" (the continue-reading card for anyone not signed in) must not bring a forgotten story back
const forgetLocal = (storyId?: number) => { try { if (storyId === undefined || JSON.parse(lsGet('lastRead') || 'null')?.id === storyId) localStorage.removeItem('lastRead') } catch { /* nothing to clear */ } }
// what the confirm dialog is about: the story ids to forget, or everything
const confirm = ref<number[] | 'all' | null>(null), busy = ref(false)
const asking = computed(() => confirm.value === 'all' ? 'ล้างประวัติการอ่านทั้งหมด?' : confirm.value?.length === 1 ? 'ลบเรื่องนี้ออกจากประวัติ?' : `ลบ ${confirm.value?.length ?? 0} เรื่องออกจากประวัติ?`)
async function forget(target: number[] | 'all') {
  busy.value = true
  try {
    if (target === 'all') await ok(client.api.me.progress.delete())
    else await Promise.all(target.map(id => ok(client.api.me.progress({ id }).delete())))
    for (const id of target === 'all' ? [undefined] : target) forgetLocal(id)
    rows.value = target === 'all' ? [] : rows.value.filter(r => !target.includes(r.story.id))
    toast(target === 'all' ? 'ล้างประวัติการอ่านแล้ว' : target.length === 1 ? 'ลบออกจากประวัติแล้ว' : `ลบ ${target.length} เรื่องออกจากประวัติแล้ว`)
    picked.value = new Set(); confirm.value = null
    if (!rows.value.length) selecting.value = false
  } catch (e) { toastError(e) } // some may already be gone: the list is refreshed on the next visit
  busy.value = false
}

// select mode: tick several stories and forget them at once
const selecting = ref(false), picked = ref(new Set<number>())
const toggleMode = () => { selecting.value = !selecting.value; picked.value = new Set() }
const tick = (id: number) => { const s = new Set(picked.value); s.has(id) ? s.delete(id) : s.add(id); picked.value = s }
const tickAll = () => { picked.value = picked.value.size === rows.value.length ? new Set() : new Set(rows.value.map(r => r.story.id)) }

onMounted(async () => {
  try {
    const [stories, progress] = await Promise.all([load(), ok(client.api.me.progress.get())])
    const byId = new Map(stories.map(s => [s.id, s]))
    rows.value = progress.flatMap(p => { const story = byId.get(p.storyId); return story ? [{ story, no: p.no, title: p.title, at: p.updatedAt }] : [] }) // the server returns newest first
  } catch (e) { error.value = (e as Error).message }
  loading.value = false
})
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end gap-3">
    <div class="min-w-0 basis-full sm:flex-1 sm:basis-0">
      <h1 class="font-serif text-[clamp(26px,4vw,38px)] font-bold leading-snug">ประวัติการอ่าน</h1>
      <p v-if="!loading && total" class="muted mt-1 text-sm">{{ total }} เรื่อง · เรียงจากที่อ่านล่าสุด</p>
    </div>
    <template v-if="total">
      <Button :variant="selecting ? 'solid' : 'outline'" @click="toggleMode">{{ selecting ? 'เสร็จสิ้น' : 'เลือกหลายเรื่อง' }}</Button>
      <Button v-if="!selecting" variant="outline" @click="confirm = 'all'">ล้างประวัติทั้งหมด</Button>
    </template>
  </header>

  <p v-if="error" class="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>
  <Bar v-if="loading" />
  <div v-else-if="!total && !error" class="rounded-xl border border-line bg-surface px-6 py-10 text-center">
    <p class="font-serif text-lg font-bold">ยังไม่มีประวัติการอ่าน</p>
    <p class="muted mt-1 text-sm">เรื่องที่คุณเปิดอ่านจะมาอยู่ที่นี่ เพื่อกลับมาอ่านต่อได้ทันที</p>
    <Button to="/story" class="mt-5">ไปเลือกนิยาย</Button>
  </div>

  <template v-else>
  <div v-if="selecting" class="sticky top-[68px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
    <Button variant="ghost" size="sm" @click="tickAll">{{ picked.size === rows.length ? 'ไม่เลือกเลย' : 'เลือกทั้งหมด' }}</Button>
    <span class="muted flex-1 text-sm">เลือกแล้ว {{ picked.size }} เรื่อง</span>
    <template v-if="picked.size">
      <Button variant="outline" size="sm" @click="confirm = [...picked]">ลบที่เลือก</Button>
    </template>
  </div>
  <ul class="divide-y divide-line rounded-xl border border-line bg-surface">
    <li v-for="r in rows" :key="r.story.id" class="flex items-center gap-3 p-3">
      <input v-if="selecting" type="checkbox" :checked="picked.has(r.story.id)" :aria-label="`เลือก ${r.story.title}`" class="size-5 shrink-0 accent-primary" @change="tick(r.story.id)" />
      <router-link :to="`/story/${r.story.id}`" class="w-14 shrink-0" :aria-label="`เปิดเรื่อง ${r.story.title}`" tabindex="-1"><BookCover :title="r.story.title" :genre="r.story.genre" :image="r.story.coverImage" /></router-link>
      <div class="min-w-0 flex-1">
        <router-link :to="`/story/${r.story.id}`" class="line-clamp-2 font-serif font-bold leading-snug hover:text-primary">{{ r.story.title }}</router-link>
        <div class="muted mt-0.5 line-clamp-2 text-xs">อ่านถึงตอนที่ {{ r.no }}<template v-if="r.title"> · {{ r.title }}</template> (จาก {{ r.story.chapterCount }} ตอน)<template v-if="r.at"> · {{ fmtDateTime(r.at) }}</template></div>
        <div v-if="r.story.chapterCount > r.no" class="mt-1 text-xs text-primary">ยังมีตอนถัดไปอีก {{ r.story.chapterCount - r.no }} ตอน</div>
      </div>
      <div v-if="!selecting" class="flex shrink-0 flex-col gap-1 sm:flex-row">
        <Button size="sm" :to="`/story/${r.story.id}/read/${r.no}`">อ่านต่อ</Button>
        <Button size="sm" variant="ghost" :aria-label="`ลบ ${r.story.title} ออกจากประวัติ`" @click="confirm = [r.story.id]">ลบ</Button>
      </div>
    </li>
  </ul>
  </template>

  <Modal :open="!!confirm" :title="asking" size="sm" @close="confirm = null">
    <p class="muted text-sm">เรื่องจะหายไปจากรายการนี้ แต่ยังอ่านได้ตามปกติ และเครื่องหมายตอนที่อ่านจบแล้วจะยังอยู่</p>
    <template #footer>
      <Button variant="ghost" @click="confirm = null">ยกเลิก</Button>
      <Button variant="danger" :loading="busy" @click="forget(confirm!)">ลบ</Button>
    </template>
  </Modal>
</template>
