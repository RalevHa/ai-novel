<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ArrowLeft, Eye, EyeOff, EllipsisVertical, Pencil, Sparkles, Square, Trash2 } from 'lucide-vue-next'
import { client, ok } from '../api'
import CharactersPanel from '../components/CharactersPanel.vue'
import CoverUploader from '../components/CoverUploader.vue'
import StoryForm, { type StoryInput } from '../components/StoryForm.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Dot from '../components/ui/Dot.vue'
import DropMenu from '../components/ui/DropMenu.vue'
import Input from '../components/ui/Input.vue'
import RichEditor from '../components/RichEditor.vue'
import Modal from '../components/ui/Modal.vue'
import Tabs from '../components/ui/Tabs.vue'
import Textarea from '../components/ui/Textarea.vue'
import { toast, toastError } from '../toast'

const id = useRoute().params.id as string
const load = () => ok(client.api.admin.stories({ id: Number(id) }).get())
type Story = Awaited<ReturnType<typeof load>>
type Chapter = Story['chapters'][number]
const story = ref<Story | null>(null), tab = ref('chapters'), saving = ref(false)
const edit = ref<{ id: number; no: number; title: string; content: string; summary: string } | null>(null), del = ref<Chapter | null>(null)
const missingSummaries = computed(() => (story.value?.chapters ?? []).filter(c => !c.summary))
const editOrig = ref('') // JSON of the chapter when the dialog opened, to warn before discarding changes
const summarizing = ref(false), backfill = ref<{ done: number; total: number } | null>(null)

// generate
const instruction = ref(''), out = ref(''), streaming = ref(false)
let ctrl: AbortController | null = null

// Leaving mid-generation is allowed (the server keeps what was written as a draft) but never silent.
const LEAVE_MSG = 'กำลังเขียนตอนอยู่ ถ้าออกจากหน้านี้ จะเก็บเฉพาะส่วนที่เขียนไว้แล้วเป็นฉบับร่าง'
const warnUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
watch(streaming, on => on ? addEventListener('beforeunload', warnUnload) : removeEventListener('beforeunload', warnUnload))
onBeforeRouteLeave(() => !streaming.value || confirm(LEAVE_MSG))

async function refresh() {
  try { story.value = await load() } catch (e) { toastError(e) }
}
onMounted(refresh)
onBeforeUnmount(() => { removeEventListener('beforeunload', warnUnload); ctrl?.abort() })

async function saveStory(body: StoryInput) {
  saving.value = true
  try { await ok(client.api.admin.stories({ id: Number(id) }).patch(body)); toast('บันทึกแล้ว'); await refresh() }
  catch (e) { toastError(e) } finally { saving.value = false }
}
async function patchChapter(c: { id: number }, body: { title?: string; content?: string; summary?: string; published?: boolean }) {
  try { await ok(client.api.admin.chapters({ id: c.id }).patch(body)); await refresh() }
  catch (e) { toastError(e) }
}
const uploadImage = async (file: File) => (await ok(client.api.admin.images.post({ file }))).url
const openEdit = (c: Chapter) => { edit.value = { id: c.id, no: c.no, title: c.title, content: c.content, summary: c.summary }; editOrig.value = JSON.stringify(edit.value) }
function closeEdit() {
  if (edit.value && JSON.stringify(edit.value) !== editOrig.value && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ปิดแล้วจะหายทั้งหมด ปิดเลยไหม?')) return
  edit.value = null
}
async function saveEdit() {
  if (!edit.value) return
  await patchChapter(edit.value, { title: edit.value.title, content: edit.value.content, summary: edit.value.summary })
  edit.value = null
}
async function removeChapter() {
  if (!del.value) return
  try { await ok(client.api.admin.chapters({ id: del.value.id }).delete()); del.value = null; await refresh() }
  catch (e) { toastError(e) }
}

// AI recap of one chapter (the AI reads these as memory when writing the next chapters)
async function summarize(c: { id: number }) {
  const r = await ok(client.api.admin.chapters({ id: c.id }).summarize.post())
  return r.summary
}
async function summarizeEdit() {
  if (!edit.value) return
  summarizing.value = true
  try {
    // the server summarises what is saved, so save the text being edited first
    await ok(client.api.admin.chapters({ id: edit.value.id }).patch({ title: edit.value.title, content: edit.value.content }))
    edit.value.summary = await summarize(edit.value); editOrig.value = JSON.stringify(edit.value); toast('สรุปตอนแล้ว'); await refresh()
  }
  catch (e) { toastError(e) } finally { summarizing.value = false }
}
// one by one, stopping at the first failure so a rate limit or bad key does not burn through every chapter
async function summarizeMissing() {
  const todo = (story.value?.chapters ?? []).filter(c => !c.summary)
  backfill.value = { done: 0, total: todo.length }
  try {
    for (const c of todo) { await summarize(c); backfill.value.done++ }
    toast(`สรุปครบ ${todo.length} ตอนแล้ว`)
  } catch (e) { toastError(e) } finally { backfill.value = null; await refresh() }
}

async function generate() {
  streaming.value = true; out.value = ''
  ctrl = new AbortController()
  try {
    const r = await fetch(`/api/admin/stories/${id}/generate`, {
      method: 'POST', credentials: 'include', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: instruction.value }),
    })
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
    const rd = r.body.getReader(), dec = new TextDecoder()
    for (;;) {
      const { done, value } = await rd.read()
      if (done) break
      out.value += dec.decode(value, { stream: true })
    }
    instruction.value = ''
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toastError(e)
  } finally {
    const stopped = ctrl?.signal.aborted
    streaming.value = false; ctrl = null
    await refresh() // server saved the chapter as an unpublished draft
    if (stopped) setTimeout(refresh, 1500) // on stop the server saves just after we disconnect
    else setTimeout(refresh, 30_000) // the server writes the recap in the background after the chapter is saved
  }
}

const menu = (c: Chapter) => [
  { label: c.published ? 'ซ่อนตอน' : 'เผยแพร่ตอน', icon: c.published ? EyeOff : Eye, action: () => patchChapter(c, { published: !c.published }) },
  { label: 'แก้ไข', icon: Pencil, action: () => openEdit(c) },
  { label: 'ลบตอน', icon: Trash2, danger: true, action: () => { del.value = c } },
]
</script>

<template>
  <Bar v-if="!story" />
  <template v-if="story">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="icon" to="/admin/stories" aria-label="กลับ" class="-ml-2"><ArrowLeft class="size-5" /></Button>
      <h1 class="font-serif text-[26px] font-bold">{{ story.title }}</h1>
      <span :class="['rounded-full px-2.5 py-0.5 text-xs', story.published ? 'bg-success/15 text-success' : 'bg-fg/10']">{{ story.published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง' }}</span>
    </div>

    <Tabs v-model="tab" :items="[{ value: 'chapters', label: 'ตอน' }, { value: 'characters', label: 'ตัวละคร' }, { value: 'settings', label: 'ตั้งค่าเรื่อง' }]" class="mb-5" />

    <section v-if="tab === 'chapters'">
      <div class="mb-6 rounded-xl border border-line bg-surface p-4">
        <div class="mb-2 text-sm font-medium">ให้ AI เขียนตอนที่ {{ (story.chapters[story.chapters.length - 1]?.no ?? 0) + 1 }}</div>
        <Textarea v-model="instruction" :rows="2" compact :disabled="streaming" placeholder="คำสั่ง (เว้นว่าง = เขียนต่อจากตอนก่อนหน้า) เช่น ให้พระเอกพบตัวละครลึกลับ" />
        <div class="mt-3">
          <Button v-if="!streaming" @click="generate"><Sparkles class="size-5" />เขียนตอนใหม่</Button>
          <Button v-else variant="danger" @click="ctrl?.abort()"><Square class="size-4" />หยุดและเก็บที่เขียนไว้</Button>
        </div>
        <p class="muted mt-3 text-xs">AI จะเห็นรายชื่อตัวละคร สรุปของทุกตอนก่อนหน้า และอ่านสองตอนล่าสุดแบบเต็ม</p>
        <Bar v-if="streaming" class="mt-3" />
        <div v-if="out" class="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-dashed border-line p-3 leading-[1.9]">{{ out }}</div>
      </div>

      <div v-if="missingSummaries.length" class="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <span class="flex-1">{{ missingSummaries.length }} ตอนยังไม่มีสรุป AI จะใช้แค่ต้นตอนแทนเมื่อเขียนตอนต่อไป</span>
        <Button size="sm" variant="outline" :loading="!!backfill" @click="summarizeMissing">{{ backfill ? `กำลังสรุป ${backfill.done}/${backfill.total}` : 'สร้างสรุปที่ยังไม่มี' }}</Button>
      </div>

      <ul v-if="story.chapters.length" class="divide-y divide-line rounded-xl border border-line bg-surface">
        <li v-for="c in story.chapters" :key="c.id" class="flex items-center gap-1 pr-2 first:rounded-t-xl last:rounded-b-xl hover:bg-fg/5">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-3 p-3 text-left" @click="openEdit(c)">
            <span class="w-9 shrink-0 text-center tabular-nums text-fg/60">{{ c.no }}</span>
            <span class="min-w-0">
              <span class="block truncate font-serif">{{ c.title || `ตอนที่ ${c.no}` }}</span>
              <span class="muted mt-0.5 block text-sm"><Dot :on="c.published" class="mr-1" />{{ c.published ? 'เผยแพร่' : 'ฉบับร่าง' }}<span v-if="!c.summary"> · ยังไม่มีสรุป</span></span>
            </span>
          </button>
          <Button v-if="!c.published" size="sm" class="hidden sm:inline-flex" @click="patchChapter(c, { published: true })">เผยแพร่</Button>
          <DropMenu :items="menu(c)" label="เมนูของตอน">
            <template #button="{ label }"><Button variant="ghost" size="icon" :aria-label="label"><EllipsisVertical class="size-5" /></Button></template>
          </DropMenu>
        </li>
      </ul>
      <p v-else class="muted py-8 text-center">ยังไม่มีตอน ให้ AI เขียนตอนแรกจากกล่องด้านบน</p>
    </section>

    <CharactersPanel v-else-if="tab === 'characters'" :story-id="Number(id)" />
    <div v-else class="grid gap-8 md:grid-cols-[200px_1fr]">
      <CoverUploader :story-id="Number(id)" :title="story.title" :genre="story.genre" :image="story.coverImage" @changed="refresh" />
      <StoryForm :initial="story" :busy="saving" @save="saveStory" />
    </div>

    <Modal :open="!!edit" :title="`แก้ไขตอนที่ ${edit?.no}`" size="lg" wide @close="closeEdit">
      <template v-if="edit">
        <Input v-model="edit.title" label="ชื่อตอน" />
        <div class="mb-1.5 text-sm font-medium">เนื้อหา</div>
        <RichEditor v-model="edit.content" :upload="uploadImage" />
        <Textarea v-model="edit.summary" label="สรุปตอน (AI ใช้เป็นความจำตอนเขียนตอนถัดไป)" :rows="4" compact />
        <Button variant="outline" size="sm" class="mb-2 mt-2" :loading="summarizing" @click="summarizeEdit"><Sparkles class="size-4" />สรุปใหม่ด้วย AI</Button>
        <p class="muted text-xs">ถ้าแก้เนื้อหาตอนแล้ว ควรกดสรุปใหม่ มิฉะนั้น AI จะจำเนื้อหาเดิม</p>
      </template>
      <template #footer><Button variant="ghost" @click="closeEdit">ยกเลิก</Button><Button @click="saveEdit">บันทึก</Button></template>
    </Modal>

    <Modal :open="!!del" :title="`ลบตอนที่ ${del?.no}?`" size="sm" @close="del = null">
      <p class="muted">ลบแล้วกู้คืนไม่ได้</p>
      <template #footer><Button variant="ghost" @click="del = null">ยกเลิก</Button><Button variant="danger" @click="removeChapter">ลบตอน</Button></template>
    </Modal>
  </template>
</template>
