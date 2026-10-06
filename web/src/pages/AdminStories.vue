<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, EllipsisVertical, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import StoryForm, { type StoryInput } from '../components/StoryForm.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Dot from '../components/ui/Dot.vue'
import DropMenu from '../components/ui/DropMenu.vue'
import Modal from '../components/ui/Modal.vue'
import { toastError } from '../toast'

const load = () => ok(client.api.admin.stories.get())
type Row = Awaited<ReturnType<typeof load>>[number]
const router = useRouter()
const rows = ref<Row[]>([]), loading = ref(true), dialog = ref(false), busy = ref(false)
const del = ref<Row | null>(null)

const refresh = async () => {
  try { rows.value = await load() } catch (e) { toastError(e) }
  loading.value = false
}
onMounted(refresh)

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

  <Bar v-if="loading" />

  <ul v-else-if="rows.length" class="divide-y divide-line rounded-xl border border-line bg-surface">
    <li v-for="r in rows" :key="r.id" class="flex items-center gap-2 pr-2 first:rounded-t-xl last:rounded-b-xl hover:bg-fg/5">
      <router-link :to="`/admin/stories/${r.id}`" class="flex min-w-0 flex-1 items-center gap-4 p-3">
        <div class="w-11 shrink-0"><BookCover :title="r.title" :genre="r.genre" :image="r.coverImage" /></div>
        <div class="min-w-0">
          <div class="truncate font-serif font-bold">{{ r.title }}</div>
          <div class="muted mt-1 truncate text-sm">
            <Dot :on="r.published" class="mr-1" />{{ r.published ? 'เผยแพร่' : 'ฉบับร่าง' }}
            · {{ r.chapterCount }} ตอน<template v-if="r.draftCount"> ({{ r.draftCount }} ร่าง)</template><template v-if="r.genre"> · {{ r.genre }}</template>
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

  <button v-if="rows.length" type="button" class="fixed bottom-20 right-4 z-20 grid size-14 place-items-center rounded-full bg-primary text-on-primary shadow-lg md:hidden" aria-label="สร้างเรื่องใหม่" @click="dialog = true"><Plus class="size-6" /></button>

  <Modal :open="dialog" title="สร้างเรื่องใหม่" size="lg" @close="dialog = false"><StoryForm :busy="busy" submit-label="สร้างเรื่อง" @save="create" /></Modal>

  <Modal :open="!!del" :title="`ลบ &quot;${del?.title}&quot; และทุกตอน?`" size="sm" @close="del = null">
    <p class="muted">ลบแล้วกู้คืนไม่ได้</p>
    <template #footer><Button variant="ghost" @click="del = null">ยกเลิก</Button><Button variant="danger" @click="remove">ลบเรื่อง</Button></template>
  </Modal>
</template>
