<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Modal from '../components/ui/Modal.vue'
import { fmtDateTime, stripChapterPrefix } from '../genre'
import { toast, toastError } from '../toast'

// Chapters this account bookmarked, newest first. Chapters no longer visible to readers drop out.
const load = () => ok(client.api.me['chapter-bookmarks'].get())
type Row = Awaited<ReturnType<typeof load>>[number]
const rows = ref<Row[]>([]), loading = ref(true), error = ref('')
const total = computed(() => rows.value.length)
const key = (r: Row) => `${r.storyId}-${r.no}`

// what the confirm dialog is about: the rows to remove, or everything
const confirm = ref<Row[] | 'all' | null>(null), busy = ref(false)
const targets = computed(() => confirm.value === 'all' ? rows.value : confirm.value ?? [])
const asking = computed(() => confirm.value === 'all' ? 'ล้างบุ๊กมาร์กทั้งหมด?' : targets.value.length === 1 ? 'เอาบุ๊กมาร์กตอนนี้ออก?' : `เอาบุ๊กมาร์ก ${targets.value.length} ตอนออก?`)
async function remove() {
  const gone = targets.value
  busy.value = true
  try {
    await Promise.all(gone.map(r => ok(client.api.me['chapter-bookmarks']({ id: r.storyId })({ no: r.no }).delete())))
    const keys = new Set(gone.map(key))
    rows.value = rows.value.filter(r => !keys.has(key(r)))
    toast(gone.length === 1 ? 'เอาบุ๊กมาร์กออกแล้ว' : `เอาบุ๊กมาร์ก ${gone.length} ตอนออกแล้ว`)
    picked.value = new Set(); confirm.value = null
    if (!rows.value.length) selecting.value = false
  } catch (e) { toastError(e) } // some may already be gone: the list is refreshed on the next visit
  busy.value = false
}

// select mode: tick several chapters and remove them at once
const selecting = ref(false), picked = ref(new Set<string>())
const toggleMode = () => { selecting.value = !selecting.value; picked.value = new Set() }
const tick = (k: string) => { const s = new Set(picked.value); s.has(k) ? s.delete(k) : s.add(k); picked.value = s }
const tickAll = () => { picked.value = picked.value.size === total.value ? new Set() : new Set(rows.value.map(key)) }

onMounted(async () => {
  try { rows.value = await load() } catch (e) { error.value = (e as Error).message }
  loading.value = false
})
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end gap-3">
    <div class="min-w-0 basis-full sm:flex-1 sm:basis-0">
      <h1 class="font-serif text-[clamp(26px,4vw,38px)] font-bold leading-snug">ตอนที่บุ๊กมาร์ก</h1>
      <p v-if="!loading && total" class="muted mt-1 text-sm">{{ total }} ตอน · เรียงจากที่บุ๊กมาร์กล่าสุด</p>
    </div>
    <template v-if="total">
      <Button :variant="selecting ? 'solid' : 'outline'" @click="toggleMode">{{ selecting ? 'เสร็จสิ้น' : 'เลือกหลายตอน' }}</Button>
      <Button v-if="!selecting" variant="outline" @click="confirm = 'all'">ล้างบุ๊กมาร์กทั้งหมด</Button>
    </template>
  </header>

  <p v-if="error" class="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>
  <Bar v-if="loading" />
  <div v-else-if="!total && !error" class="rounded-xl border border-line bg-surface px-6 py-10 text-center">
    <p class="font-serif text-lg font-bold">ยังไม่ได้บุ๊กมาร์กตอนไหน</p>
    <p class="muted mt-1 text-sm">กดไอคอนบุ๊กมาร์กที่แถบล่างของหน้าอ่าน แล้วตอนนั้นจะมารวมอยู่ที่นี่</p>
    <Button to="/story" class="mt-5">ไปเลือกนิยาย</Button>
  </div>

  <template v-else>
    <div v-if="selecting" class="sticky top-[68px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
      <Button variant="ghost" size="sm" @click="tickAll">{{ picked.size === total ? 'ไม่เลือกเลย' : 'เลือกทั้งหมด' }}</Button>
      <span class="muted flex-1 text-sm">เลือกแล้ว {{ picked.size }} ตอน</span>
      <Button v-if="picked.size" variant="outline" size="sm" @click="confirm = rows.filter(r => picked.has(key(r)))">เอาที่เลือกออก</Button>
    </div>
    <ul class="divide-y divide-line rounded-xl border border-line bg-surface">
      <li v-for="r in rows" :key="key(r)" class="flex items-center gap-3 p-3">
        <input v-if="selecting" type="checkbox" :checked="picked.has(key(r))" :aria-label="`เลือกตอนที่ ${r.no} ของ ${r.storyTitle}`" class="size-5 shrink-0 accent-primary" @change="tick(key(r))" />
        <router-link :to="`/story/${r.storyId}`" class="w-14 shrink-0" :aria-label="`เปิดเรื่อง ${r.storyTitle}`" tabindex="-1"><BookCover :title="r.storyTitle" :genre="r.genre" :image="r.coverImage" /></router-link>
        <div class="min-w-0 flex-1">
          <router-link :to="`/story/${r.storyId}/read/${r.no}`" class="line-clamp-2 font-serif font-bold leading-snug hover:text-primary">ตอนที่ {{ r.no }}: {{ stripChapterPrefix(r.title) }}</router-link>
          <div class="muted mt-0.5 line-clamp-2 text-xs">{{ r.storyTitle }} · {{ fmtDateTime(r.createdAt) }}</div>
        </div>
        <div v-if="!selecting" class="flex shrink-0 flex-col gap-1 sm:flex-row">
          <Button size="sm" :to="`/story/${r.storyId}/read/${r.no}`">อ่าน</Button>
          <Button size="sm" variant="ghost" :aria-label="`เอาบุ๊กมาร์กตอนที่ ${r.no} ของ ${r.storyTitle} ออก`" @click="confirm = [r]">เอาออก</Button>
        </div>
      </li>
    </ul>
  </template>

  <Modal :open="!!confirm" :title="asking" size="sm" @close="confirm = null">
    <p class="muted text-sm">ตอนจะหายไปจากรายการนี้ แต่ยังอ่านได้ตามปกติ และบุ๊กมาร์กใหม่ได้ทุกเมื่อ</p>
    <template #footer>
      <Button variant="ghost" @click="confirm = null">ยกเลิก</Button>
      <Button variant="danger" :loading="busy" @click="remove">เอาออก</Button>
    </template>
  </Modal>
</template>
