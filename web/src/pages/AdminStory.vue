<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ArrowLeft, Eye, EyeOff, EllipsisVertical, Pencil, Sparkles, Square, Trash2 } from 'lucide-vue-next'
import { client, ok } from '../api'
import CharactersPanel from '../components/CharactersPanel.vue'
import CoverUploader from '../components/CoverUploader.vue'
import StoryForm, { type StoryInput } from '../components/StoryForm.vue'
import Bar from '../components/ui/Bar.vue'
import ComboInput from '../components/ui/ComboInput.vue'
import DateTimeInput from '../components/ui/DateTimeInput.vue'
import Button from '../components/ui/Button.vue'
import Dot from '../components/ui/Dot.vue'
import DropMenu from '../components/ui/DropMenu.vue'
import Input from '../components/ui/Input.vue'
import RichEditor from '../components/RichEditor.vue'
import Modal from '../components/ui/Modal.vue'
import Pager from '../components/ui/Pager.vue'
import Segmented from '../components/ui/Segmented.vue'
import Switch from '../components/ui/Switch.vue'
import Tabs from '../components/ui/Tabs.vue'
import Textarea from '../components/ui/Textarea.vue'
import { fmtCost, fmtDateTime, fromLocalInput, parseDb, toLocalInput } from '../genre'
import { MODELS } from '../models'
import { setTitle } from '../title'
import { toast, toastError } from '../toast'

const id = useRoute().params.id as string
const load = () => ok(client.api.admin.stories({ id: Number(id) }).get())
const SIZE = 50
const loadChapters = () => ok(client.api.admin.stories({ id: Number(id) }).chapters.get({ query: { page: page.value || undefined, size: SIZE } }))
type Story = Awaited<ReturnType<typeof load>>
type Chapter = Awaited<ReturnType<typeof loadChapters>>['items'][number]
const story = ref<Story | null>(null), tab = ref('chapters'), saving = ref(false)
const chapters = ref<Chapter[]>([]), total = ref(0), page = ref(0) // page 0 = ask for the last page (newest chapters)
const edit = ref<{ id: number; no: number; title: string; content: string; summary: string; publishAt: string } | null>(null), del = ref<Chapter | null>(null)
const missingSummaries = computed(() => story.value?.missingSummaryIds ?? [])
const editOrig = ref('') // JSON of the chapter when the dialog opened, to warn before discarding changes
const summarizing = ref(false), backfill = ref<{ done: number; total: number } | null>(null)

// this month's AI spending against MONTHLY_BUDGET_USD (budget 0 = no cap)
const usage = ref<{ spent: number; budget: number } | null>(null)
const loadUsage = () => ok(client.api.admin.usage.get()).then(u => { usage.value = u }).catch(() => {})

// generate: `fromOutline` takes the story's next planned chapter; `count` writes that many in a row
const instruction = ref(''), out = ref(''), streaming = ref(false)
const fromOutline = ref(false), count = ref('1'), batchNo = ref(0)
const COUNTS = [{ k: '1', n: '1' }, { k: '2', n: '2' }, { k: '3', n: '3' }, { k: '5', n: '5' }]
let ctrl: AbortController | null = null

// Leaving mid-generation is allowed (the server keeps what was written as a draft) but never silent.
const LEAVE_MSG = 'กำลังเขียนตอนอยู่ ถ้าออกจากหน้านี้ จะเก็บเฉพาะส่วนที่เขียนไว้แล้วเป็นฉบับร่าง'
const warnUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
watch(streaming, on => on ? addEventListener('beforeunload', warnUnload) : removeEventListener('beforeunload', warnUnload))
onBeforeRouteLeave(() => !streaming.value || confirm(LEAVE_MSG))

// bulk publish / hide
const selected = ref<number[]>([]), bulkBusy = ref(false)
// the selection survives page changes; the header checkbox acts on the visible page
const pageIds = computed(() => chapters.value.map(c => c.id))
const pageSelected = computed(() => pageIds.value.filter(i => selected.value.includes(i)).length)
const allSelected = computed(() => !!pageIds.value.length && pageSelected.value === pageIds.value.length)
const toggleAll = () => { selected.value = allSelected.value ? selected.value.filter(i => !pageIds.value.includes(i)) : [...new Set([...selected.value, ...pageIds.value])] }
async function bulkPublish(published: boolean) {
  bulkBusy.value = true
  try {
    const { updated } = await ok(client.api.admin.stories({ id: Number(id) }).chapters.patch({ ids: selected.value, published }))
    toast(`${published ? 'เผยแพร่' : 'ซ่อน'} ${updated} ตอนแล้ว`); selected.value = []; await refresh()
  } catch (e) { toastError(e) } finally { bulkBusy.value = false }
}

// saved versions of the chapter being edited (the server keeps the text before every overwrite)
type Version = Awaited<ReturnType<typeof loadVersions>>[number]
const loadVersions = () => ok(client.api.admin.chapters({ id: edit.value!.id }).versions.get())
const versions = ref<Version[]>([]), restoring = ref(0)
async function showHistory() {
  try { versions.value = await loadVersions() } catch (e) { toastError(e) }
}
async function restoreVersion(v: Version) {
  if (!edit.value) return
  if (JSON.stringify(edit.value) !== editOrig.value && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก กู้คืนแล้วจะหายทั้งหมด กู้คืนเลยไหม?')) return
  restoring.value = v.id
  try {
    await ok(client.api.admin.chapters({ id: edit.value.id }).restore({ version: v.id }).post())
    toast('กู้คืนแล้ว (ฉบับที่ถูกแทนที่ยังอยู่ในประวัติ) ควรกดสรุปใหม่'); await openEdit(edit.value); await refresh()
  } catch (e) { toastError(e) } finally { restoring.value = 0 }
}

// continuity report for the saved text: contradictions with the cast and earlier recaps
const check = ref({ report: '', busy: false })
async function runCheck() {
  if (!edit.value) return
  check.value = { report: '', busy: true }
  try { check.value.report = (await ok(client.api.admin.chapters({ id: edit.value.id }).check.post())).report; loadUsage() }
  catch (e) { toastError(e) } finally { check.value.busy = false }
}

// rewrite the chapter being edited with another model; the preview is applied to the editor, never saved by itself
const editTab = ref('content')
const rw = ref({ model: '', note: '', out: '', busy: false })
let rwCtrl: AbortController | null = null
watch(() => edit.value?.id, () => { rwCtrl?.abort(); rw.value = { ...rw.value, out: '', busy: false }; check.value = { report: '', busy: false } })
watch(editTab, t => { if (t === 'history') showHistory() })
async function rewrite() {
  if (!edit.value) return
  rw.value.busy = true; rw.value.out = ''
  rwCtrl = new AbortController()
  try {
    const r = await fetch(`/api/admin/chapters/${edit.value.id}/rewrite`, {
      method: 'POST', credentials: 'include', signal: rwCtrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: rw.value.model, instruction: rw.value.note }),
    })
    if (!r.ok || !r.body) throw new Error((await r.text()) || `HTTP ${r.status}`)
    const rd = r.body.getReader(), dec = new TextDecoder()
    for (;;) {
      const { done, value } = await rd.read()
      if (done) break
      rw.value.out += dec.decode(value, { stream: true })
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toastError(e)
  } finally { rw.value.busy = false; rwCtrl = null }
}
function applyRewrite() {
  // drop the "⚠️ ..." note the server appends when the model looped or the stream broke
  const text = rw.value.out.split('\n\n⚠️')[0].trim()
  if (!edit.value || !text) return
  // same shape as the AI drafts: title on the first line, one blank line between paragraphs
  edit.value.title = text.split('\n')[0].replace(/^#+\s*/, '').slice(0, 110)
  edit.value.content = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '').join('\n\n')
  rw.value.out = ''; editTab.value = 'content'
  toast('ใส่ฉบับใหม่ในตัวแก้ไขแล้ว กดบันทึกเพื่อยืนยัน')
}

async function refresh() {
  try {
    const [s, r] = await Promise.all([load(), loadChapters()])
    story.value = s; setTitle(`จัดการ ${s.title}`); chapters.value = r.items; total.value = r.total; page.value = r.page
    if (!s.nextBeat) fromOutline.value = false
  } catch (e) { toastError(e) }
  loadUsage()
}
async function goto(p: number) {
  page.value = p
  try { const r = await loadChapters(); chapters.value = r.items; total.value = r.total; page.value = r.page } catch (e) { toastError(e) }
}
onMounted(refresh)
onBeforeUnmount(() => { removeEventListener('beforeunload', warnUnload); ctrl?.abort(); rwCtrl?.abort() })

async function saveStory(body: StoryInput) {
  saving.value = true
  try { await ok(client.api.admin.stories({ id: Number(id) }).patch(body)); toast('บันทึกแล้ว'); await refresh() }
  catch (e) { toastError(e) } finally { saving.value = false }
}
async function patchChapter(c: { id: number }, body: { title?: string; content?: string; summary?: string; published?: boolean; publishAt?: string | null }) {
  try { await ok(client.api.admin.chapters({ id: c.id }).patch(body)); await refresh() }
  catch (e) { toastError(e) }
}
const uploadImage = async (file: File) => (await ok(client.api.admin.images.post({ file }))).url
// the list carries no text, so the full chapter is fetched when it is opened
async function openEdit(c: { id: number }) {
  try {
    const r = await ok(client.api.admin.chapters({ id: c.id }).get())
    edit.value = { id: r.id, no: r.no, title: r.title, content: r.content, summary: r.summary, publishAt: toLocalInput(r.publishAt) }; editTab.value = 'content'; editOrig.value = JSON.stringify(edit.value); schedOrig = edit.value.publishAt
  } catch (e) { toastError(e) }
}
function closeEdit() {
  if (edit.value && JSON.stringify(edit.value) !== editOrig.value && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ปิดแล้วจะหายทั้งหมด ปิดเลยไหม?')) return
  edit.value = null
}
let schedOrig = '' // the schedule when the dialog opened; only a changed one is sent
async function saveEdit() {
  if (!edit.value) return
  const at = fromLocalInput(edit.value.publishAt)
  // a time = goes live then; clearing a schedule puts the chapter back to draft rather than publishing it right away
  const schedule = edit.value.publishAt === schedOrig ? {} : at ? { publishAt: at, published: true } : { publishAt: null, published: false }
  await patchChapter(edit.value, { title: edit.value.title, content: edit.value.content, summary: edit.value.summary, ...schedule })
  edit.value = null
}
const scheduled = (c: { published: boolean; publishAt: string | Date | null }) => c.published && !!c.publishAt && parseDb(c.publishAt)!.getTime() > Date.now()
async function removeChapter() {
  if (!del.value) return
  try { await ok(client.api.admin.chapters({ id: del.value.id }).delete()); selected.value = selected.value.filter(i => i !== del.value!.id); del.value = null; await refresh() }
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
  const todo = (story.value?.missingSummaryIds ?? []).map(id => ({ id }))
  backfill.value = { done: 0, total: todo.length }
  try {
    for (const c of todo) { await summarize(c); backfill.value.done++ }
    toast(`สรุปครบ ${todo.length} ตอนแล้ว`)
  } catch (e) { toastError(e) } finally { backfill.value = null; await refresh() }
}

// streams one chapter into `out`; resolves with its text (the server appends a "⚠️ ..." note when the model looped or failed)
async function generateOne() {
  out.value = ''
  const r = await fetch(`/api/admin/stories/${id}/generate`, {
    method: 'POST', credentials: 'include', signal: ctrl!.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction: instruction.value, fromOutline: fromOutline.value }),
  })
  if (!r.ok || !r.body) throw new Error((await r.text()) || `HTTP ${r.status}`)
  const rd = r.body.getReader(), dec = new TextDecoder()
  for (;;) {
    const { done, value } = await rd.read()
    if (done) break
    out.value += dec.decode(value, { stream: true })
  }
  return out.value
}

async function generate() {
  streaming.value = true
  ctrl = new AbortController()
  const n = fromOutline.value ? Number(count.value) : 1
  try {
    for (batchNo.value = 1; batchNo.value <= n; batchNo.value++) {
      // a marker in the text means it looped or broke: stop instead of paying for more of the same
      if ((await generateOne()).includes('⚠️')) break
    }
    instruction.value = ''
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toastError(e)
  } finally {
    const stopped = ctrl?.signal.aborted
    streaming.value = false; ctrl = null; batchNo.value = 0
    page.value = 0 // jump to the last page, where the new draft is
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
      <span :class="['rounded-full px-2.5 py-0.5 text-xs', story.published ? 'bg-success/15 text-fg' : 'bg-fg/10']">{{ story.published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง' }}</span>
      <span v-if="story.spent || story.views || usage?.budget" class="muted ml-auto text-sm">
        <span v-if="story.views" title="รวมทุกตอน นับแบบไม่ระบุตัวตน (ไม่เก็บว่าใครอ่าน)">เปิดอ่าน {{ story.views.toLocaleString() }} ครั้ง<template v-if="story.finishes"> · จบ {{ Math.min(100, Math.round(story.finishes / story.views * 100)) }}%</template></span>
        <span v-if="story.spent" :class="story.views ? 'ml-3' : ''" title="รวมค่าเขียนและสรุปทุกตอนที่ระบบบันทึกไว้">เรื่องนี้ใช้ไป {{ fmtCost(story.spent) }}</span>
        <span v-if="usage?.budget" :class="['ml-3', usage.spent >= usage.budget * 0.8 && 'font-medium text-danger']" title="ค่า AI ของตอนที่เขียนเดือนนี้ เทียบกับ MONTHLY_BUDGET_USD">เดือนนี้ {{ fmtCost(usage.spent) }} / {{ fmtCost(usage.budget) }}</span>
      </span>
    </div>

    <Tabs v-model="tab" :items="[{ value: 'chapters', label: 'ตอน' }, { value: 'characters', label: 'ตัวละคร' }, { value: 'settings', label: 'ตั้งค่าเรื่อง' }]" class="mb-5" />

    <section v-if="tab === 'chapters'">
      <div class="mb-6 rounded-xl border border-line bg-surface p-4">
        <div class="mb-2 text-sm font-medium">ให้ AI เขียนตอนที่ {{ story.nextNo }}</div>
        <Textarea v-model="instruction" :rows="2" compact :disabled="streaming" placeholder="คำสั่ง (เว้นว่าง = เขียนต่อจากตอนก่อนหน้า) เช่น ให้พระเอกพบตัวละครลึกลับ" />
        <div v-if="story.nextBeat" class="mt-3 rounded-lg border border-dashed border-line p-3 text-sm">
          <Switch v-model="fromOutline" :disabled="streaming" label="เขียนตามแผนเรื่อง" />
          <p class="muted mt-2">ตอนถัดไปตามแผน: <span class="text-fg">{{ story.nextBeat }}</span></p>
          <div v-if="fromOutline" class="mt-2 flex items-center gap-3">
            <span class="muted">เขียนติดกัน</span>
            <Segmented v-model="count" :options="COUNTS" label="จำนวนตอนที่เขียนติดกัน" class="w-40" />
            <span class="muted">ตอน (หยุดเองถ้าโมเดลวนซ้ำ ผิดพลาด หรือแผนหมด)</span>
          </div>
        </div>
        <div class="mt-3">
          <Button v-if="!streaming" @click="generate"><Sparkles class="size-5" />{{ fromOutline && Number(count) > 1 ? `เขียน ${count} ตอนตามแผน` : 'เขียนตอนใหม่' }}</Button>
          <Button v-else variant="danger" @click="ctrl?.abort()"><Square class="size-4" />หยุดและเก็บที่เขียนไว้<template v-if="Number(count) > 1 && fromOutline"> (ตอน {{ batchNo }}/{{ count }})</template></Button>
        </div>
        <p class="muted mt-3 text-xs">AI จะเห็นรายชื่อตัวละคร สรุปของทุกตอนก่อนหน้า และอ่านสองตอนล่าสุดแบบเต็ม</p>
        <Bar v-if="streaming" class="mt-3" />
        <div v-if="out" class="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-dashed border-line p-3 leading-[1.9]">{{ out }}</div>
      </div>

      <div v-if="missingSummaries.length" class="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <span class="flex-1">{{ missingSummaries.length }} ตอนยังไม่มีสรุป AI จะใช้แค่ต้นตอนแทนเมื่อเขียนตอนต่อไป</span>
        <Button size="sm" variant="outline" :loading="!!backfill" @click="summarizeMissing">{{ backfill ? `กำลังสรุป ${backfill.done}/${backfill.total}` : 'สร้างสรุปที่ยังไม่มี' }}</Button>
      </div>

      <div v-if="total" class="mb-2 flex min-h-10 flex-wrap items-center gap-2 px-1 text-sm">
        <label class="flex cursor-pointer items-center gap-2">
          <input type="checkbox" class="size-4 accent-primary" :checked="allSelected" :indeterminate="!!pageSelected && !allSelected" @change="toggleAll" />
          {{ selected.length ? `เลือกแล้ว ${selected.length} ตอน` : 'เลือกทั้งหน้า' }}
        </label>
        <template v-if="selected.length">
          <Button size="sm" :loading="bulkBusy" @click="bulkPublish(true)"><Eye class="size-4" />เผยแพร่</Button>
          <Button size="sm" variant="outline" :loading="bulkBusy" @click="bulkPublish(false)"><EyeOff class="size-4" />ซ่อน</Button>
          <Button size="sm" variant="ghost" @click="selected = []">ล้างที่เลือก</Button>
        </template>
      </div>
      <ul v-if="total" class="divide-y divide-line rounded-xl border border-line bg-surface">
        <li v-for="c in chapters" :key="c.id" class="flex items-center gap-1 pr-2 first:rounded-t-xl last:rounded-b-xl hover:bg-fg/5">
          <label class="ml-1 grid size-11 shrink-0 cursor-pointer place-items-center"><input v-model="selected" type="checkbox" :value="c.id" :aria-label="`เลือกตอนที่ ${c.no}`" class="size-4 accent-primary" /></label>
          <button type="button" class="flex min-w-0 flex-1 items-center gap-3 p-3 text-left" @click="openEdit(c)">
            <span class="w-9 shrink-0 text-center tabular-nums text-fg/75">{{ c.no }}</span>
            <span class="min-w-0">
              <span class="block truncate font-serif">{{ c.title || `ตอนที่ ${c.no}` }}</span>
              <span class="muted mt-0.5 block text-sm"><Dot :on="c.published && !scheduled(c)" class="mr-1" />{{ scheduled(c) ? `ตั้งเวลา ${fmtDateTime(c.publishAt)}` : c.published ? 'เผยแพร่' : 'ฉบับร่าง' }}<span v-if="!c.hasSummary"> · ยังไม่มีสรุป</span><span v-if="c.cost != null" :title="`${c.tokens?.toLocaleString()} tokens`"> · {{ fmtCost(c.cost) }}</span><span v-if="c.views" title="จำนวนครั้งที่เปิดอ่านและอ่านจบ (นับแบบไม่ระบุตัวตน)"> · อ่าน {{ c.views.toLocaleString() }} ครั้ง<template v-if="c.finishes"> (จบ {{ Math.min(100, Math.round(c.finishes / c.views * 100)) }}%)</template></span></span>
            </span>
          </button>
          <Button v-if="!c.published || scheduled(c)" size="sm" class="hidden sm:inline-flex" @click="patchChapter(c, { published: true })">เผยแพร่ตอนนี้</Button>
          <DropMenu :items="menu(c)" label="เมนูของตอน">
            <template #button="{ label }"><Button variant="ghost" size="icon" :aria-label="label"><EllipsisVertical class="size-5" /></Button></template>
          </DropMenu>
        </li>
      </ul>
      <p v-else class="muted py-8 text-center">ยังไม่มีตอน ให้ AI เขียนตอนแรกจากกล่องด้านบน</p>
      <Pager :model-value="page" :size="SIZE" :total="total" @update:model-value="goto" />
    </section>

    <CharactersPanel v-else-if="tab === 'characters'" :story-id="Number(id)" />
    <div v-else class="grid gap-8 md:grid-cols-[200px_1fr]">
      <CoverUploader :story-id="Number(id)" :title="story.title" :genre="story.genre" :image="story.coverImage" @changed="refresh" />
      <StoryForm :initial="story" :busy="saving" @save="saveStory" />
    </div>

    <Modal :open="!!edit" :title="`แก้ไขตอนที่ ${edit?.no}`" size="lg" wide @close="closeEdit">
      <template v-if="edit">
        <Input v-model="edit.title" label="ชื่อตอน" />
        <DateTimeInput v-model="edit.publishAt" label="ตั้งเวลาเผยแพร่ (ไม่บังคับ)" hint="ตั้งเวลาแล้วกดบันทึก ตอนจะขึ้นให้ผู้อ่านเมื่อถึงเวลา ล้างช่องนี้เพื่อยกเลิก (ตอนจะกลับเป็นฉบับร่าง)" />
        <Tabs v-model="editTab" class="mb-4" :items="[{ value: 'content', label: 'เนื้อหา' }, { value: 'summary', label: 'สรุป' }, { value: 'rewrite', label: `เขียนใหม่${rw.busy ? ' …' : rw.out ? ' ●' : ''}` }, { value: 'check', label: 'ตรวจความต่อเนื่อง' }, { value: 'history', label: 'ประวัติ' }]" />

        <!-- v-show: switching tabs must not drop the editor's undo history and scroll position -->
        <div v-show="editTab === 'content'"><RichEditor v-model="edit.content" :upload="uploadImage" /></div>

        <div v-if="editTab === 'summary'">
          <Textarea v-model="edit.summary" label="สรุปตอน (AI ใช้เป็นความจำตอนเขียนตอนถัดไป)" :rows="8" compact />
          <Button variant="outline" size="sm" class="mb-2 mt-2" :loading="summarizing" @click="summarizeEdit"><Sparkles class="size-4" />สรุปใหม่ด้วย AI</Button>
          <p class="muted text-xs">ถ้าแก้เนื้อหาตอนแล้ว ควรกดสรุปใหม่ มิฉะนั้น AI จะจำเนื้อหาเดิม (ระบบจะบันทึกเนื้อหาที่แก้ไว้ก่อนสรุป)</p>
        </div>

        <div v-if="editTab === 'rewrite'">
          <ComboInput v-model="rw.model" label="Model" :options="MODELS" hint="เว้นว่าง = ใช้โมเดลของเรื่อง" />
          <Textarea v-model="rw.note" label="คำแนะนำเพิ่มเติม (ไม่บังคับ)" :rows="2" compact :disabled="rw.busy" placeholder="เช่น เพิ่มบทสนทนา ให้อารมณ์หนักขึ้น" />
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Button v-if="!rw.busy" size="sm" variant="outline" @click="rewrite"><Sparkles class="size-4" />เขียนใหม่</Button>
            <Button v-else size="sm" variant="danger" @click="rwCtrl?.abort()"><Square class="size-4" />หยุด</Button>
            <Button v-if="rw.out && !rw.busy" size="sm" @click="applyRewrite">ใช้ฉบับนี้แทนเนื้อหา</Button>
          </div>
          <p class="muted mt-2 text-xs">ใช้เนื้อหาที่บันทึกไว้ล่าสุดเป็นต้นฉบับ (รูปในตอนจะไม่ถูกนำมา) ผลลัพธ์ยังไม่ถูกบันทึกจนกว่าจะกด "บันทึก" และควรกดสรุปใหม่หลังใช้</p>
          <Bar v-if="rw.busy" class="mt-2" />
          <div v-if="rw.out" class="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-dashed border-line p-3 leading-[1.9]">{{ rw.out }}</div>
        </div>

        <div v-if="editTab === 'check'">
          <Button size="sm" variant="outline" :loading="check.busy" @click="runCheck"><Sparkles class="size-4" />ตรวจความต่อเนื่อง</Button>
          <p class="muted mt-2 text-xs">ให้ AI เทียบเนื้อหาที่บันทึกไว้ล่าสุดกับรายชื่อตัวละครและสรุปตอนก่อนหน้า แล้วชี้จุดที่ขัดกัน (เสียค่า AI ต่อครั้ง ใช้โมเดลจาก CHECK_MODEL ถ้าตั้งไว้) ผลเป็นแค่คำแนะนำ ไม่ได้แก้อะไรให้</p>
          <Bar v-if="check.busy" class="mt-2" />
          <div v-if="check.report" class="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 leading-[1.8]">{{ check.report }}</div>
        </div>

        <div v-if="editTab === 'history'">
          <p v-if="!versions.length" class="muted py-4 text-center text-sm">ยังไม่มีประวัติ ระบบจะเก็บฉบับเดิมไว้ทุกครั้งที่บันทึกการแก้เนื้อหาหรือชื่อตอน (เก็บ 10 ฉบับล่าสุด)</p>
          <ul v-else class="divide-y divide-line rounded-xl border border-line">
            <li v-for="v in versions" :key="v.id" class="flex items-start gap-3 p-3">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium">{{ fmtDateTime(v.createdAt) }} <span class="muted font-normal">· {{ v.length.toLocaleString() }} ตัวอักษร</span></div>
                <div class="truncate font-serif">{{ v.title || '(ไม่มีชื่อ)' }}</div>
                <p class="muted mt-1 line-clamp-2 text-sm">{{ v.excerpt }}</p>
              </div>
              <Button size="sm" variant="outline" :loading="restoring === v.id" @click="restoreVersion(v)">กู้คืน</Button>
            </li>
          </ul>
          <p class="muted mt-2 text-xs">กู้คืนแล้วฉบับที่ถูกแทนที่จะถูกเก็บในประวัติด้วย จึงย้อนกลับได้อีกครั้ง</p>
        </div>
      </template>
      <template #footer><Button variant="ghost" @click="closeEdit">ยกเลิก</Button><Button @click="saveEdit">บันทึก</Button></template>
    </Modal>

    <Modal :open="!!del" :title="`ลบตอนที่ ${del?.no}?`" size="sm" @close="del = null">
      <p class="muted">ลบแล้วกู้คืนไม่ได้</p>
      <template #footer><Button variant="ghost" @click="del = null">ยกเลิก</Button><Button variant="danger" @click="removeChapter">ลบตอน</Button></template>
    </Modal>
  </template>
</template>
