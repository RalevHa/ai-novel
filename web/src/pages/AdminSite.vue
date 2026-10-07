<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, ok } from '../api'
import DocProse from '../components/DocProse.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Input from '../components/ui/Input.vue'
import Modal from '../components/ui/Modal.vue'
import RichEditor from '../components/RichEditor.vue'
import Tabs from '../components/ui/Tabs.vue'
import Textarea from '../components/ui/Textarea.vue'
import { fmtDateTime } from '../genre'
import { previewPlaceholders, renderDoc } from '../infoDoc'
import { toast, toastError } from '../toast'

type Slug = 'terms' | 'privacy' | 'guide' | 'about' | 'contact'
const loadPages = () => ok(client.api.admin.pages.get())
const loadRevisions = (slug: Slug) => ok(client.api.admin.pages({ slug }).revisions.get())
const pages = ref<Awaited<ReturnType<typeof loadPages>>>([]), loading = ref(true)

// ---- contact details quoted by the pages ({{operator}}, {{contactEmail}})
const operator = ref(''), email = ref(''), savingSettings = ref(false), emailSet = ref(true)
async function loadSettings() {
  const s = await ok(client.api.admin.site.get())
  operator.value = s.operator; email.value = s.contactEmail; emailSet.value = !!s.contactEmail
}
async function saveSettings() {
  savingSettings.value = true
  try { await ok(client.api.admin.site.put({ operator: operator.value, contactEmail: email.value })); await loadSettings(); toast('บันทึกข้อมูลติดต่อแล้ว') }
  catch (e) { toastError(e) } finally { savingSettings.value = false }
}

// ---- editing one page
const editing = ref<Slug | null>(null), tab = ref('write'), title = ref(''), body = ref(''), original = ref(''), isDefault = ref(true)
const shipped = ref<{ title: string; body: string } | null>(null), revisions = ref<Awaited<ReturnType<typeof loadRevisions>>>([])
const busy = ref(false), confirmReset = ref(false)
const dirty = () => editing.value !== null && JSON.stringify([title.value, body.value]) !== original.value

async function open(slug: Slug) {
  try {
    const p = await ok(client.api.admin.pages({ slug }).get())
    title.value = p.title; body.value = p.body; original.value = JSON.stringify([p.title, p.body]); isDefault.value = p.isDefault; shipped.value = p.default
    tab.value = 'write'; confirmReset.value = false; revisions.value = []; editing.value = slug
  } catch (e) { toastError(e) }
}
async function showHistory() {
  tab.value = 'history'
  try { revisions.value = await loadRevisions(editing.value!) } catch (e) { toastError(e) }
}
const onTab = (t: string | undefined) => { if (t === 'history') showHistory(); else tab.value = t ?? 'write' }
async function useRevision(id: number) {
  try {
    const r = await ok(client.api.admin.pages({ slug: editing.value! }).revisions({ id }).get())
    title.value = r.title; body.value = r.body; tab.value = 'write'; toast('นำเวอร์ชันนี้มาใส่ในตัวแก้ไขแล้ว ยังไม่ได้บันทึก')
  } catch (e) { toastError(e) }
}
async function save() {
  busy.value = true
  try {
    await ok(client.api.admin.pages({ slug: editing.value! }).put({ title: title.value, body: body.value }))
    toast('บันทึกแล้ว วันที่ปรับปรุงล่าสุดอัปเดตให้อัตโนมัติ'); editing.value = null; pages.value = await loadPages()
  } catch (e) { toastError(e) } finally { busy.value = false }
}
async function resetToDefault() {
  busy.value = true
  try {
    await ok(client.api.admin.pages({ slug: editing.value! }).delete())
    toast('กลับไปใช้ข้อความตั้งต้นแล้ว'); editing.value = null; pages.value = await loadPages()
  } catch (e) { toastError(e) } finally { busy.value = false }
}
const close = () => { if (!dirty() || window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ปิดโดยไม่บันทึกหรือไม่?')) editing.value = null }
const preview = () => renderDoc(previewPlaceholders(body.value, { operator: operator.value, contactEmail: email.value }))
const PATH: Record<Slug, string> = { terms: '/terms', privacy: '/privacy', guide: '/guide', about: '/about', contact: '/contact' }

onMounted(async () => {
  try { [pages.value] = await Promise.all([loadPages(), loadSettings()]) } catch (e) { toastError(e) }
  loading.value = false
})
</script>

<template>
  <h1 class="mb-1 font-serif text-[26px] font-bold">ตั้งค่าเว็บไซต์</h1>
  <p class="muted mb-6 text-sm">ข้อมูลติดต่อและเนื้อหาหน้าข้อมูล (ข้อกำหนด นโยบาย คู่มือ เกี่ยวกับเรา ติดต่อเรา)</p>
  <Bar v-if="loading" />

  <template v-else>
    <section class="mb-10" aria-labelledby="contact-h">
      <h2 id="contact-h" class="mb-1 font-medium">ข้อมูลติดต่อ</h2>
      <p class="muted mb-4 text-sm">แสดงในหน้าข้อมูลทุกหน้าแทน <code v-pre>{{operator}}</code> และ <code v-pre>{{contactEmail}}</code> ถ้าเว้นว่างจะใช้ค่าจากเซิร์ฟเวอร์ (<code>OPERATOR_NAME</code>, <code>CONTACT_EMAIL</code>) หรือค่าเริ่มต้น</p>
      <p v-if="!emailSet" class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="status">ยังไม่ได้ตั้งอีเมลติดต่อ หน้าข้อกำหนดและนโยบายจะไม่มีช่องทางติดต่อผู้ให้บริการ (ซึ่ง PDPA ต้องมี) ตั้งก่อนเปิดใช้งานจริง</p>
      <form class="max-w-md" @submit.prevent="saveSettings">
        <Input v-model="operator" label="ชื่อผู้ให้บริการ" placeholder="เช่น บริษัท ตัวอย่าง จำกัด หรือชื่อของคุณ" />
        <Input v-model="email" label="อีเมลติดต่อ" type="email" autocomplete="off" hint="ผู้อ่านจะใช้อีเมลนี้ขอลบบัญชี แจ้งปัญหา และแจ้งเนื้อหาละเมิด" />
        <Button type="submit" :loading="savingSettings">บันทึกข้อมูลติดต่อ</Button>
      </form>
    </section>

    <section aria-labelledby="pages-h">
      <h2 id="pages-h" class="mb-3 font-medium">หน้าข้อมูล</h2>
      <ul class="divide-y divide-line rounded-xl border border-line bg-surface">
        <li v-for="p in pages" :key="p.slug" class="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
          <div class="min-w-0 flex-1 basis-48">
            <div class="font-medium">{{ p.title }} <span class="muted text-sm font-normal">{{ PATH[p.slug] }}</span></div>
            <div class="muted text-xs">{{ p.isDefault ? 'ข้อความตั้งต้น' : `แก้ไขแล้ว · ${fmtDateTime(p.updatedAt)}${p.editor ? ` โดย ${p.editor}` : ''}` }}</div>
          </div>
          <Button variant="ghost" size="sm" :to="PATH[p.slug]">ดูหน้า</Button>
          <Button variant="outline" size="sm" @click="open(p.slug)">แก้ไข</Button>
        </li>
      </ul>
      <p class="muted mt-3 text-xs">เนื้อหาเขียนเป็น Markdown ใช้ตัวแทน <code v-pre>{{operator}}</code> และ <code v-pre>{{contactEmail}}</code> ได้ ลิงก์ในเว็บเขียนเป็น <code>[ข้อความ](/privacy)</code> ไม่รองรับ HTML และรูปภาพ ข้อกำหนดและนโยบายควรให้ผู้เชี่ยวชาญกฎหมายตรวจก่อนแก้ และการแก้ไม่ทำให้ผู้ใช้เดิมต้องยอมรับใหม่</p>
    </section>
  </template>

  <Modal :open="!!editing" :title="`แก้ไข: ${pages.find(p => p.slug === editing)?.title ?? ''}`" size="lg" wide @close="close">
    <Tabs :model-value="tab" :items="[{ value: 'write', label: 'เขียน' }, { value: 'markdown', label: 'Markdown' }, { value: 'preview', label: 'ตัวอย่าง' }, { value: 'history', label: 'ประวัติ' }]" class="mb-4" @update:model-value="onTab" />

    <div v-show="tab === 'write'">
      <Input v-model="title" label="หัวข้อหน้า" />
      <RichEditor v-model="body" docs />
      <p class="muted text-xs">พิมพ์ <code v-pre>{{operator}}</code> และ <code v-pre>{{contactEmail}}</code> ตรง ๆ ในข้อความเพื่อให้ระบบแทนด้วยชื่อและอีเมลติดต่อ ไม่รองรับรูปภาพ</p>
    </div>

    <div v-show="tab === 'markdown'">
      <Textarea v-model="body" label="เนื้อหา (Markdown)" :rows="20" />
      <p class="muted text-xs">แก้แบบข้อความดิบ ใช้เมื่ออยากควบคุมเอง หัวข้อใช้ <code>## ชื่อ</code> รายการใช้ <code>- ข้อความ</code> ลิงก์ใช้ <code>[ข้อความ](/privacy)</code> การแก้ที่นี่และในแท็บ "เขียน" เป็นข้อความเดียวกัน</p>
    </div>

    <div v-show="tab === 'preview'">
      <p class="muted mb-3 text-xs">ตัวอย่างตามข้อมูลติดต่อที่กรอกอยู่ในหน้านี้ (ยังไม่ได้บันทึก)</p>
      <h3 class="font-serif text-2xl font-bold">{{ title }}</h3>
      <DocProse :html="preview()" />
    </div>

    <div v-show="tab === 'history'">
      <p v-if="!revisions.length" class="muted text-sm">ยังไม่มีประวัติ จะเริ่มเก็บเมื่อบันทึกครั้งแรก</p>
      <ul v-else class="divide-y divide-line rounded-xl border border-line text-sm">
        <li v-for="r in revisions" :key="r.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
          <span class="min-w-0 flex-1 basis-40"><b>{{ r.title }}</b><span class="muted block text-xs">{{ fmtDateTime(r.createdAt) }}<template v-if="r.editor"> · {{ r.editor }}</template></span></span>
          <Button variant="outline" size="sm" @click="useRevision(r.id)">นำมาใส่ในตัวแก้ไข</Button>
        </li>
      </ul>
    </div>

    <template #footer>
      <Button v-if="!isDefault && !confirmReset" variant="ghost" class="mr-auto" @click="confirmReset = true">ใช้ข้อความตั้งต้น</Button>
      <template v-if="confirmReset">
        <span class="mr-auto self-center text-sm">แทนที่ด้วยข้อความตั้งต้น?</span>
        <Button variant="danger" :loading="busy" @click="resetToDefault">ยืนยัน</Button>
        <Button variant="ghost" @click="confirmReset = false">ไม่</Button>
      </template>
      <template v-else>
        <Button variant="ghost" @click="close">ยกเลิก</Button>
        <Button :loading="busy" :disabled="!dirty()" @click="save">บันทึก</Button>
      </template>
    </template>
  </Modal>
</template>
