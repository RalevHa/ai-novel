<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, EllipsisVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import StoryForm, { type StoryInput } from '../components/StoryForm.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Dot from '../components/ui/Dot.vue'
import DropMenu from '../components/ui/DropMenu.vue'
import Modal from '../components/ui/Modal.vue'
import Pager from '../components/ui/Pager.vue'
import { fmtCost } from '../genre'
import { toastError } from '../toast'

const page = ref(1), size = ref(20), total = ref(0)
const q = ref('')
const load = () => ok(client.api.admin.stories.get({ query: { page: page.value, size: size.value, q: q.value.trim() || undefined } }))
type Row = Awaited<ReturnType<typeof load>>['items'][number]
const router = useRouter()
const rows = ref<Row[]>([]), loading = ref(true), dialog = ref(false), busy = ref(false)
const del = ref<Row | null>(null)

const refresh = async () => {
  try { const r = await load(); rows.value = r.items; total.value = r.total; page.value = r.page } catch (e) { toastError(e) }
  loading.value = false
}
// this month's AI spending against MONTHLY_BUDGET_USD (0 = no cap)
const usage = ref<{ spent: number; budget: number } | null>(null)
onMounted(() => { refresh(); ok(client.api.admin.usage.get()).then(u => { usage.value = u }).catch(() => {}) })
watch(page, refresh)
let typing: ReturnType<typeof setTimeout> | undefined
watch(q, () => { clearTimeout(typing); typing = setTimeout(() => { page.value === 1 ? refresh() : (page.value = 1) }, 300) }) // back to page 1, then the page watcher reloads

async function create(body: StoryInput) {
  busy.value = true
  try {
    const s = await ok(client.api.admin.stories.post(body))
    router.push(`/admin/stories/${s.id}`)
  } catch (e) { toastError(e) } finally { busy.value = false }
}
async function toggle(r: Row) {
  try { await ok(client.api.admin.stories({ id: r.id }).patch({ published: !r.published })); r.published = !r.published }
  catch (e) { toastError(e) }
}
async function remove() {
  if (!del.value) return
  try { await ok(client.api.admin.stories({ id: del.value.id }).delete()); del.value = null; await refresh() }
  catch (e) { toastError(e) }
}
const menu = (r: Row) => [
  { label: r.published ? 'ซ่อนเรื่อง' : 'เผยแพร่เรื่อง', icon: r.published ? EyeOff : Eye, action: () => toggle(r) },
  { label: 'จัดการตอนและตั้งค่า', icon: Pencil, to: `/admin/stories/${r.id}` },
  { label: 'ลบเรื่อง', icon: Trash2, danger: true, action: () => { del.value = r } },
]
</script>

<template>
  <div class="mb-6 flex items-center">
    <h1 class="flex-1 font-serif text-[26px] font-bold">จัดการนิยาย</h1>
    <Button class="hidden md:inline-flex" @click="dialog = true"><Plus class="size-5" />สร้างเรื่องใหม่</Button>
  </div>

  <div v-if="usage && (usage.budget || usage.spent)" class="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
    <div class="flex items-center justify-between gap-3">
      <span title="ที่คีย์ของเว็บจ่าย ไม่รวมที่นักเขียนจ่ายด้วยคีย์ของตัวเอง">ค่า AI เดือนนี้ (คีย์ของเว็บ)</span>
      <span :class="usage.budget && usage.spent >= usage.budget * 0.8 ? 'font-medium text-danger' : 'font-medium'">{{ fmtCost(usage.spent) }}<template v-if="usage.budget"> / {{ fmtCost(usage.budget) }}</template></span>
    </div>
    <div v-if="usage.budget" class="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-label="งบ AI เดือนนี้" aria-valuemin="0" :aria-valuenow="Math.round(usage.spent * 100) / 100" :aria-valuemax="usage.budget">
      <div :class="['h-full rounded-full', usage.spent >= usage.budget * 0.8 ? 'bg-danger' : 'bg-primary']" :style="{ width: `${Math.min(100, (usage.spent / usage.budget) * 100)}%` }" />
    </div>
  </div>

  <div v-if="total || q" class="relative mb-4">
    <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg/60" aria-hidden="true" />
    <input v-model="q" type="text" inputmode="search" autocomplete="off" aria-label="ค้นหานิยายตามชื่อ" placeholder="ค้นหานิยายตามชื่อ"
      class="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-11 outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25" />
    <button v-if="q" type="button" class="absolute inset-y-0 right-0 grid w-11 place-items-center text-fg/60 hover:text-fg" aria-label="ล้างคำค้นหา" @click="q = ''"><X class="size-4" /></button>
  </div>

  <Bar v-if="loading" />

  <ul v-else-if="rows.length" class="divide-y divide-line rounded-xl border border-line bg-surface">
    <li v-for="r in rows" :key="r.id" class="flex items-center gap-2 pr-2 first:rounded-t-xl last:rounded-b-xl hover:bg-fg/5">
      <router-link :to="`/admin/stories/${r.id}`" class="flex min-w-0 flex-1 items-center gap-4 p-3">
        <div class="w-11 shrink-0"><BookCover :title="r.title" :genre="r.genre" :image="r.coverImage" /></div>
        <div class="min-w-0">
          <div class="truncate font-serif font-bold">{{ r.title }}</div>
          <div class="muted mt-1 truncate text-sm">
            <Dot :on="r.published" class="mr-1" />{{ r.published ? 'เผยแพร่' : 'ฉบับร่าง' }}
            · {{ r.chapterCount }} ตอน<template v-if="r.draftCount"> ({{ r.draftCount }} ร่าง)</template><template v-if="r.status === 'completed'"> · จบแล้ว</template><template v-if="r.genre"> · {{ r.genre }}</template><template v-if="r.spent"> · {{ fmtCost(r.spent) }}</template>
          </div>
        </div>
      </router-link>
      <DropMenu :items="menu(r)" label="เมนูของเรื่อง">
        <template #button="{ label }"><Button variant="ghost" size="icon" :aria-label="label"><EllipsisVertical class="size-5" /></Button></template>
      </DropMenu>
    </li>
  </ul>

  <div v-else class="py-12 text-center">
    <div class="font-serif text-xl">ยังไม่มีเรื่อง</div>
    <p class="muted mb-4 mt-2">สร้างเรื่องแรก แล้วให้ AI เขียนตอนแรกให้</p>
    <Button @click="dialog = true"><Plus class="size-5" />สร้างเรื่องใหม่</Button>
  </div>

  <Pager v-if="!loading" v-model="page" :size="size" :total="total" />

  <button v-if="rows.length" type="button" class="fixed bottom-20 right-4 z-20 grid size-14 place-items-center rounded-full bg-primary text-on-primary shadow-lg md:hidden" aria-label="สร้างเรื่องใหม่" @click="dialog = true"><Plus class="size-6" /></button>

  <Modal :open="dialog" title="สร้างเรื่องใหม่" size="lg" @close="dialog = false"><StoryForm :busy="busy" submit-label="สร้างเรื่อง" @save="create" /></Modal>

  <Modal :open="!!del" :title="`ลบ &quot;${del?.title}&quot; และทุกตอน?`" size="sm" @close="del = null">
    <p class="muted">ลบแล้วกู้คืนไม่ได้</p>
    <template #footer><Button variant="ghost" @click="del = null">ยกเลิก</Button><Button variant="danger" @click="remove">ลบเรื่อง</Button></template>
  </Modal>
</template>
