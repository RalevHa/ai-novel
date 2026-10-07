<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Segmented from '../components/ui/Segmented.vue'
import { fmtDate, parseDb } from '../genre'
import { useBookmarks } from '../stores/bookmarks'
import { toast, toastError } from '../toast'

const load = () => ok(client.api.me.following.get())
type Row = Awaited<ReturnType<typeof load>>[number]
const marks = useBookmarks()
const rows = ref<Row[]>([]), loading = ref(true)

const SORTS = [{ k: 'followed', n: 'ติดตามล่าสุด' }, { k: 'updated', n: 'อัปเดตล่าสุด' }, { k: 'unread', n: 'ยังไม่อ่านมาก' }] as const
type Sort = (typeof SORTS)[number]['k']
const sort = ref<Sort>('followed')
const filter = ref<'all' | 'unread' | 'done'>('all')

const time = (v: string | Date | null) => parseDb(v)?.getTime() ?? 0
const unread = (r: Row) => Math.max(0, r.chapterCount - r.readCount)
const counts = computed(() => ({ all: rows.value.length, unread: rows.value.filter(r => unread(r)).length, done: rows.value.filter(r => r.chapterCount && !unread(r)).length }))
const shown = computed(() => {
  const order: Record<Sort, (a: Row, b: Row) => number> = {
    followed: (a, b) => time(b.followedAt) - time(a.followedAt),
    updated: (a, b) => (time(b.updatedAt) || time(b.createdAt)) - (time(a.updatedAt) || time(a.createdAt)),
    unread: (a, b) => unread(b) - unread(a) || time(b.updatedAt) - time(a.updatedAt),
  }
  const keep = (r: Row) => filter.value === 'all' || (filter.value === 'unread' ? unread(r) > 0 : r.chapterCount > 0 && !unread(r))
  return rows.value.filter(keep).sort(order[sort.value])
})

// select mode: tick several stories and stop following them at once (two taps, so a slip does not undo the shelf)
const selecting = ref(false), picked = ref(new Set<number>()), confirm = ref(false), busy = ref(false)
const toggleMode = () => { selecting.value = !selecting.value; picked.value = new Set(); confirm.value = false }
const tick = (id: number) => { const s = new Set(picked.value); s.has(id) ? s.delete(id) : s.add(id); picked.value = s; confirm.value = false }
const tickAll = () => { picked.value = picked.value.size === shown.value.length ? new Set() : new Set(shown.value.map(r => r.id)); confirm.value = false }

async function unfollow(ids: number[]) {
  busy.value = true
  let failed = 0
  for (const id of ids) {
    try { await marks.toggle(id); rows.value = rows.value.filter(r => r.id !== id) } catch (e) { failed++; if (failed === 1) toastError(e) }
  }
  busy.value = false
  if (ids.length > failed) toast(ids.length - failed === 1 ? 'เลิกติดตามแล้ว' : `เลิกติดตาม ${ids.length - failed} เรื่องแล้ว`)
  picked.value = new Set(); confirm.value = false
  if (!rows.value.length) selecting.value = false
}

onMounted(async () => {
  await marks.load() // toggle() decides follow/unfollow from the store, so it must know the shelf first
  try { rows.value = await load() } catch (e) { toastError(e) }
  loading.value = false
})

const chip = (on: boolean) => ['inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors sm:min-h-9', on ? 'border-primary bg-primary text-on-primary' : 'border-line hover:bg-fg/5']
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end gap-3">
    <div class="min-w-0 flex-1">
      <h1 class="font-serif text-[clamp(26px,4vw,38px)] font-bold leading-snug">เรื่องที่ติดตาม</h1>
      <p v-if="!loading && rows.length" class="muted mt-1 text-sm">{{ rows.length }} เรื่อง · ยังมีตอนที่ไม่ได้อ่าน {{ counts.unread }} เรื่อง</p>
    </div>
    <Button v-if="rows.length" :variant="selecting ? 'solid' : 'outline'" @click="toggleMode">{{ selecting ? 'เสร็จสิ้น' : 'เลือกหลายเรื่อง' }}</Button>
  </header>

  <Bar v-if="loading" />
  <div v-else-if="!rows.length" class="rounded-xl border border-line bg-surface px-6 py-10 text-center">
    <p class="font-serif text-lg font-bold">ยังไม่ได้ติดตามเรื่องไหน</p>
    <p class="muted mt-1 text-sm">กด "ติดตาม" ที่หน้าเรื่อง แล้วเรื่องนั้นจะมารวมอยู่ที่นี่</p>
    <Button to="/" class="mt-5">ไปเลือกนิยาย</Button>
  </div>

  <template v-else>
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="flex flex-1 flex-wrap gap-2" role="group" aria-label="กรองเรื่องที่ติดตาม">
        <button type="button" :class="chip(filter === 'all')" :aria-pressed="filter === 'all'" @click="filter = 'all'">ทั้งหมด ({{ counts.all }})</button>
        <button type="button" :class="chip(filter === 'unread')" :aria-pressed="filter === 'unread'" @click="filter = 'unread'">มีตอนยังไม่อ่าน ({{ counts.unread }})</button>
        <button type="button" :class="chip(filter === 'done')" :aria-pressed="filter === 'done'" @click="filter = 'done'">อ่านครบแล้ว ({{ counts.done }})</button>
      </div>
      <Segmented :model-value="sort" :options="SORTS" label="เรียงลำดับ" class="sm:w-80" @update:model-value="sort = $event as Sort" />
    </div>

    <div v-if="selecting" class="sticky top-[68px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
      <Button variant="ghost" size="sm" @click="tickAll">{{ picked.size === shown.length ? 'ไม่เลือกเลย' : 'เลือกทั้งหมด' }}</Button>
      <span class="muted flex-1 text-sm">เลือกแล้ว {{ picked.size }} เรื่อง</span>
      <template v-if="picked.size">
        <Button v-if="!confirm" variant="outline" size="sm" @click="confirm = true">เลิกติดตามที่เลือก</Button>
        <template v-else>
          <Button variant="danger" size="sm" :loading="busy" @click="unfollow([...picked])">ยืนยันเลิกติดตาม {{ picked.size }} เรื่อง</Button>
          <Button variant="ghost" size="sm" @click="confirm = false">ยกเลิก</Button>
        </template>
      </template>
    </div>

    <p v-if="!shown.length" class="muted py-6 text-center text-sm">ไม่มีเรื่องที่ตรงกับตัวกรองนี้</p>
    <ul v-else class="divide-y divide-line rounded-xl border border-line bg-surface">
      <li v-for="r in shown" :key="r.id" class="flex items-center gap-3 p-3">
        <input v-if="selecting" type="checkbox" :checked="picked.has(r.id)" :aria-label="`เลือก ${r.title}`" class="size-5 shrink-0 accent-primary" @change="tick(r.id)" />
        <router-link :to="`/story/${r.id}`" class="w-14 shrink-0" :aria-label="`เปิดเรื่อง ${r.title}`" tabindex="-1"><BookCover :title="r.title" :genre="r.genre" :image="r.coverImage" /></router-link>
        <div class="min-w-0 flex-1">
          <router-link :to="`/story/${r.id}`" class="line-clamp-2 font-serif font-bold leading-snug hover:text-primary">{{ r.title }}</router-link>
          <div class="muted mt-0.5 truncate text-xs">โดย {{ r.authorName }} · {{ r.status === 'completed' ? 'จบแล้ว' : 'กำลังเขียน' }}<template v-if="r.updatedAt"> · อัปเดต {{ fmtDate(r.updatedAt) }}</template></div>
          <div class="mt-2 flex items-center gap-2 text-xs">
            <div class="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-fg/10" role="progressbar" :aria-label="`อ่านแล้ว ${r.readCount} จาก ${r.chapterCount} ตอน`" aria-valuemin="0" :aria-valuenow="r.readCount" :aria-valuemax="r.chapterCount">
              <div class="h-full rounded-full bg-primary" :style="{ width: r.chapterCount ? `${Math.min(100, (r.readCount / r.chapterCount) * 100)}%` : '0%' }" />
            </div>
            <span class="muted whitespace-nowrap tabular-nums">อ่านแล้ว {{ r.readCount }}/{{ r.chapterCount }}</span>
            <span v-if="unread(r)" class="whitespace-nowrap rounded-full bg-primary/15 px-2 py-0.5 text-primary">ยังไม่อ่าน {{ unread(r) }} ตอน</span>
          </div>
        </div>
        <div v-if="!selecting" class="flex shrink-0 flex-col gap-1 sm:flex-row">
          <Button v-if="r.lastNo" size="sm" :to="`/story/${r.id}/read/${r.lastNo}`">อ่านต่อตอนที่ {{ r.lastNo }}</Button>
          <Button v-else size="sm" variant="outline" :to="`/story/${r.id}`">เปิดเรื่อง</Button>
          <Button size="sm" variant="ghost" :disabled="busy" @click="unfollow([r.id])">เลิกติดตาม</Button>
        </div>
      </li>
    </ul>
  </template>
</template>
