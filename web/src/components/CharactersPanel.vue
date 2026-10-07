<script setup lang="ts">
import { aiHeaders } from '../aiKey'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { EllipsisVertical, Eye, EyeOff, ImagePlus, Pencil, Plus, Sparkles, Trash2 } from 'lucide-vue-next'
import { client, ok } from '../api'
import { imageUrl, prepareImage } from '../image'
import { toast, toastError } from '../toast'
import Bar from './ui/Bar.vue'
import FileButton from './ui/FileButton.vue'
import Switch from './ui/Switch.vue'
import Button from './ui/Button.vue'
import DropMenu from './ui/DropMenu.vue'
import Input from './ui/Input.vue'
import Modal from './ui/Modal.vue'
import Textarea from './ui/Textarea.vue'

const props = defineProps<{ storyId: number }>()

const load = () => ok(client.api.admin.stories({ id: props.storyId }).characters.get())
type Character = Awaited<ReturnType<typeof load>>[number]
type Draft = { id?: number; name: string; role: string; profile: string; visible: boolean; image?: string }

const list = ref<Character[]>([]), loading = ref(true), saving = ref(false)
const edit = ref<Draft | null>(null), del = ref<Character | null>(null)
// the portrait is staged in the dialog and uploaded together with Save (a new character has no id until it is saved)
const newImage = ref<File | null>(null), removeImage = ref(false), preview = ref('')
const setPreview = (url: string) => { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = url }
onBeforeUnmount(() => setPreview(''))
function openEdit(c?: Character) {
  newImage.value = null; removeImage.value = false; setPreview('')
  edit.value = c ? { id: c.id, name: c.name, role: c.role, profile: c.profile, visible: c.visible, image: c.image } : { name: '', role: '', profile: '', visible: true }
}
async function pickImage(file: File) {
  try { const small = await prepareImage(file, 600); newImage.value = small; removeImage.value = false; setPreview(URL.createObjectURL(small)) }
  catch (e) { toastError(e) }
}
const shownImage = () => preview.value || (removeImage.value ? '' : imageUrl(edit.value?.image))

// AI suggestions: shown for review, nothing is saved until the admin adds them
const suggestOpen = ref(false), suggesting = ref(false)
const found = ref<{ name: string; role: string; profile: string; pick: boolean }[]>([])
let suggestRun = 0

async function refresh() {
  try { list.value = await load() } catch (e) { toastError(e) }
  loading.value = false
}
onMounted(refresh)

async function save() {
  const d = edit.value
  if (!d || !d.name.trim()) return
  saving.value = true
  try {
    const body = { name: d.name.trim(), role: d.role.trim(), profile: d.profile.trim(), visible: d.visible }
    const saved = d.id
      ? await ok(client.api.admin.characters({ id: d.id }).patch(body))
      : await ok(client.api.admin.stories({ id: props.storyId }).characters.post(body))
    if (newImage.value) await ok(client.api.admin.characters({ id: saved.id }).image.post({ file: newImage.value }))
    else if (removeImage.value && d.image) await ok(client.api.admin.characters({ id: saved.id }).image.delete())
    edit.value = null
    await refresh()
  } catch (e) { toastError(e) } finally { saving.value = false }
}
async function toggleVisible(c: Character) {
  try { await ok(client.api.admin.characters({ id: c.id }).patch({ visible: !c.visible })); c.visible = !c.visible }
  catch (e) { toastError(e) }
}
async function remove() {
  if (!del.value) return
  try { await ok(client.api.admin.characters({ id: del.value.id }).delete()); del.value = null; await refresh() }
  catch (e) { toastError(e) }
}

async function suggest() {
  const run = ++suggestRun
  suggestOpen.value = true; suggesting.value = true; found.value = []
  try {
    const r = await ok(client.api.admin.stories({ id: props.storyId }).characters.suggest.post(undefined, { headers: aiHeaders() }))
    if (run === suggestRun) found.value = r.suggestions.map(s => ({ ...s, pick: true }))
  } catch (e) { if (run === suggestRun) { suggestOpen.value = false; toastError(e) } }
  finally { if (run === suggestRun) suggesting.value = false }
}
async function addPicked() {
  const picked = found.value.filter(s => s.pick)
  saving.value = true
  try {
    for (const s of picked) await ok(client.api.admin.stories({ id: props.storyId }).characters.post({ name: s.name, role: s.role, profile: s.profile }))
    toast(`เพิ่ม ${picked.length} ตัวละครแล้ว`)
    suggestOpen.value = false
    await refresh()
  } catch (e) { toastError(e) } finally { saving.value = false }
}
const closeSuggest = () => { suggestRun++; suggestOpen.value = false; suggesting.value = false }
const menu = (c: Character) => [
  { label: 'แก้ไข', icon: Pencil, action: () => openEdit(c) },
  { label: c.visible ? 'ซ่อนจากผู้อ่าน' : 'แสดงให้ผู้อ่าน', icon: c.visible ? EyeOff : Eye, action: () => toggleVisible(c) },
  { label: 'ลบตัวละคร', icon: Trash2, danger: true, action: () => { del.value = c } },
]
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <h2 class="flex-1 font-serif text-xl font-bold">ตัวละคร <span class="muted text-sm font-normal">· {{ list.length }}</span></h2>
    <Button variant="outline" @click="suggest"><Sparkles class="size-5" />ให้ AI เสนอจากเรื่อง</Button>
    <Button @click="openEdit()"><Plus class="size-5" />เพิ่มตัวละคร</Button>
  </div>
  <p class="muted mb-4 text-sm">AI จะได้รับรายชื่อนี้ทุกครั้งที่เขียนตอนใหม่ เพื่อให้ชื่อ บุคลิก และน้ำเสียงของตัวละครคงที่ตลอดเรื่อง</p>

  <Bar v-if="loading" />

  <ul v-else-if="list.length" class="divide-y divide-line rounded-xl border border-line bg-surface">
    <li v-for="c in list" :key="c.id" class="flex items-center gap-1 pr-2 first:rounded-t-xl last:rounded-b-xl hover:bg-fg/5">
      <button type="button" class="flex min-w-0 flex-1 items-start gap-3 p-3 text-left" @click="openEdit(c)">
        <img v-if="c.image" :src="imageUrl(c.image)" alt="" class="size-12 shrink-0 rounded-full object-cover" loading="lazy" />
        <span v-else class="grid size-12 shrink-0 place-items-center rounded-full bg-secondary/20 font-serif font-bold text-secondary">{{ c.name.slice(0, 1) }}</span>
        <span class="min-w-0">
          <span class="flex flex-wrap items-center gap-2">
            <span class="font-serif font-bold">{{ c.name }}</span>
            <span v-if="c.role" class="rounded-full bg-fg/10 px-2 py-0.5 text-xs">{{ c.role }}</span>
            <span v-if="!c.visible" class="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-fg"><EyeOff class="size-3" />ซ่อนจากผู้อ่าน</span>
          </span>
          <span v-if="c.profile" class="line-clamp-2 muted mt-1 block text-sm">{{ c.profile }}</span>
          <span v-else class="muted mt-1 block text-sm">ยังไม่มีรายละเอียด</span>
        </span>
      </button>
      <DropMenu :items="menu(c)" label="เมนูของตัวละคร">
        <template #button="{ label }"><Button variant="ghost" size="icon" :aria-label="label"><EllipsisVertical class="size-5" /></Button></template>
      </DropMenu>
    </li>
  </ul>

  <div v-else class="py-10 text-center">
    <div class="font-serif text-lg">ยังไม่มีตัวละคร</div>
    <p class="muted mt-2">ใส่ชื่อและนิสัยหลักไว้ AI จะใช้เขียนต่อให้ตรงเดิม หรือให้ AI ดึงจากเรื่องที่เขียนไปแล้ว</p>
  </div>

  <Modal :open="!!edit" :title="edit?.id ? 'แก้ไขตัวละคร' : 'เพิ่มตัวละคร'" size="lg" @close="edit = null">
    <form v-if="edit" id="character-form" @submit.prevent="save">
      <div class="mb-4 flex items-center gap-4">
        <img v-if="shownImage()" :src="shownImage()" alt="รูปตัวละคร" class="size-20 rounded-xl object-cover" />
        <span v-else class="grid size-20 place-items-center rounded-xl bg-secondary/15 font-serif text-2xl font-bold text-secondary">{{ edit.name.slice(0, 1) || '?' }}</span>
        <div class="flex flex-wrap gap-2">
          <FileButton @pick="pickImage"><ImagePlus class="size-4" />{{ shownImage() ? 'เปลี่ยนรูป' : 'เพิ่มรูป' }}</FileButton>
          <Button v-if="shownImage()" variant="ghost" size="sm" @click="newImage = null; removeImage = true; setPreview('')"><Trash2 class="size-4" />เอารูปออก</Button>
        </div>
      </div>
      <Input v-model="edit.name" label="ชื่อ" required />
      <Input v-model="edit.role" label="บทบาท" placeholder="เช่น พระเอก, เพื่อนร่วมทาง, ตัวร้าย" />
      <Textarea v-model="edit.profile" label="ลักษณะ นิสัย ความสัมพันธ์ และน้ำเสียงพูด" :rows="6" />
      <Switch v-model="edit.visible" label="แสดงให้ผู้อ่านเห็นในหน้าเรื่อง" class="mb-1" />
      <p class="muted mt-1 text-xs">ผู้อ่านจะเห็นชื่อ บทบาท รูป และรายละเอียดข้างบนทั้งหมด ถ้ามีสปอยล์ให้ปิดไว้หรือแก้ข้อความก่อน</p>
    </form>
    <template #footer><Button variant="ghost" @click="edit = null">ยกเลิก</Button><Button type="submit" form="character-form" :loading="saving">บันทึก</Button></template>
  </Modal>

  <Modal :open="!!del" :title="`ลบ &quot;${del?.name}&quot;?`" size="sm" @close="del = null">
    <p class="muted">AI จะไม่เห็นตัวละครนี้ในตอนต่อไป ตอนที่เขียนไปแล้วไม่เปลี่ยน</p>
    <template #footer><Button variant="ghost" @click="del = null">ยกเลิก</Button><Button variant="danger" @click="remove">ลบตัวละคร</Button></template>
  </Modal>

  <Modal :open="suggestOpen" title="ตัวละครที่ AI พบในเรื่อง" size="lg" @close="closeSuggest">
    <div v-if="suggesting" class="py-6">
      <Bar />
      <p class="muted mt-3 text-sm">กำลังอ่านเรื่องย่อและสกัดตัวละคร ใช้เวลาราว 20-60 วินาที</p>
    </div>
    <p v-else-if="!found.length" class="muted py-6 text-center">ไม่พบตัวละครใหม่ที่ยังไม่อยู่ในรายการ</p>
    <ul v-else class="space-y-2">
      <li v-for="s in found" :key="s.name" class="rounded-lg border border-line p-3">
        <label class="flex cursor-pointer items-start gap-3">
          <input v-model="s.pick" type="checkbox" class="mt-1.5 size-4 shrink-0 accent-primary" />
          <span class="min-w-0">
            <span class="font-serif font-bold">{{ s.name }}</span><span v-if="s.role" class="muted text-sm"> · {{ s.role }}</span>
            <span class="muted mt-1 block text-sm">{{ s.profile }}</span>
          </span>
        </label>
      </li>
    </ul>
    <template v-if="!suggesting" #footer>
      <Button variant="ghost" @click="closeSuggest">ปิด</Button>
      <Button v-if="found.length" :loading="saving" :disabled="!found.some(s => s.pick)" @click="addPicked">เพิ่มที่เลือก ({{ found.filter(s => s.pick).length }})</Button>
    </template>
  </Modal>
</template>
