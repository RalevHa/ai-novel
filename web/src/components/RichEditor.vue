<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import { AlignCenter, AlignLeft, AlignRight, Bold, Code, Heading2, Heading3, ImagePlus, Italic, Link2, List, Quote, Redo2, SeparatorHorizontal, Trash2, Undo2 } from 'lucide-vue-next'
import { Markdown } from 'tiptap-markdown'
import { FigureImage } from '../editor/figureImage'
import { prepareImage } from '../image'
import { dropForeignImages } from '../markdown'
import { toastError } from '../toast'

// WYSIWYG: the text is edited with the same classes the reader uses. Stored value is Markdown.
// `docs` is the mode for the site's info pages (terms, guide, ...): links and inline code are kept, there are no images, so no `upload`.
// Chapters (the default) keep their own rules: no links, no code, images through `upload`.
const props = defineProps<{ upload?: (file: File) => Promise<string>; docs?: boolean }>()
const model = defineModel<string>({ default: '' })

// trimmed on both sides of the comparison below, so the stored text has no stray blank lines and typing never re-syncs the editor
const getMd = (e: { storage: unknown }) => ((e.storage as any).markdown.getMarkdown() as string).trim()
let editor: Editor | null = null
const current = shallowRef<Editor | null>(null) // lets the toolbar render once the editor exists

async function addImage(file: File) {
  if (!editor || !props.upload) return
  try {
    const url = await props.upload(await prepareImage(file, 1200))
    editor.chain().focus().setImage({ src: url, alt: 'ภาพประกอบ' }).run()
  } catch (e) { toastError(e) }
}
const imageFrom = (files?: FileList | null) => [...(files ?? [])].find(f => f.type.startsWith('image/'))

onMounted(() => {
  editor = new Editor({
    content: dropForeignImages(model.value),
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, ...(props.docs ? {} : { code: false }), codeBlock: false, strike: false }),
      ...(props.docs ? [Link.configure({ openOnClick: false, autolink: false, linkOnPaste: false })] : [FigureImage.configure({ allowBase64: false, inline: false })]),
      Placeholder.configure({ placeholder: props.docs ? 'เขียนเนื้อหาหน้านี้ที่นี่…' : 'เขียนหรือวางเนื้อหาตอนที่นี่…' }),
      Markdown.configure({ html: false, linkify: false, breaks: false, tightLists: true }),
    ],
    editorProps: {
      attributes: { class: 'reader-body serif', 'aria-label': props.docs ? 'เนื้อหาหน้า' : 'เนื้อหาตอน', role: 'textbox', 'aria-multiline': 'true' },
      // pasted web content may carry <img> pointing anywhere: images only enter through our own upload
      transformPastedHTML: html => html.replace(/<img\b[^>]*>/gi, ''),
      handlePaste: (_v, e) => { const f = imageFrom(e.clipboardData?.files); if (!f) return false; addImage(f); return true },
      handleDrop: (_v, e) => { const f = imageFrom((e as DragEvent).dataTransfer?.files); if (!f) return false; e.preventDefault(); addImage(f); return true },
    },
    onUpdate: ({ editor: e }) => { model.value = getMd(e) },
  })
  // the editor mounts into the DOM through <EditorContent>, so expose it after creation
  current.value = editor
})
// parent changed the text (not by typing): sync without clobbering the cursor
watch(model, v => { if (editor && v !== getMd(editor)) editor.commands.setContent(dropForeignImages(v), false) })
onBeforeUnmount(() => editor?.destroy())

const tools = [
  { icon: Undo2, label: 'ย้อนกลับ', run: (e: Editor) => e.chain().focus().undo().run(), on: () => false, off: (e: Editor) => !e.can().undo() },
  { icon: Redo2, label: 'ทำซ้ำ', run: (e: Editor) => e.chain().focus().redo().run(), on: () => false, off: (e: Editor) => !e.can().redo() },
  { sep: true },
  { icon: Bold, label: 'ตัวหนา', run: (e: Editor) => e.chain().focus().toggleBold().run(), on: (e: Editor) => e.isActive('bold') },
  { icon: Italic, label: 'ตัวเอียง', run: (e: Editor) => e.chain().focus().toggleItalic().run(), on: (e: Editor) => e.isActive('italic') },
  { sep: true },
  { icon: Heading2, label: 'หัวข้อใหญ่', run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(), on: (e: Editor) => e.isActive('heading', { level: 2 }) },
  { icon: Heading3, label: 'หัวข้อย่อย', run: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(), on: (e: Editor) => e.isActive('heading', { level: 3 }) },
  { icon: Quote, label: 'ข้อความอ้างอิง', run: (e: Editor) => e.chain().focus().toggleBlockquote().run(), on: (e: Editor) => e.isActive('blockquote') },
  { icon: List, label: 'รายการ', run: (e: Editor) => e.chain().focus().toggleBulletList().run(), on: (e: Editor) => e.isActive('bulletList') },
  { icon: SeparatorHorizontal, label: 'เส้นคั่นฉาก', run: (e: Editor) => e.chain().focus().setHorizontalRule().run(), on: () => false },
] as const

// info pages also get links and inline code. Links: an in-app path (/privacy), https:// or mailto: only, so nothing like javascript: gets in.
const docTools = [
  { sep: true },
  {
    icon: Link2, label: 'ลิงก์ (กดซ้ำที่ลิงก์เพื่อเอาออก)', on: (e: Editor) => e.isActive('link'),
    run: (e: Editor) => {
      if (e.isActive('link')) return e.chain().focus().extendMarkRange('link').unsetLink().run()
      const href = window.prompt('ลิงก์ เช่น /privacy หรือ https://example.com')?.trim()
      if (!href) return
      if (!/^(\/(?!\/)|https?:\/\/|mailto:)/.test(href)) return toastError(new Error('ลิงก์ต้องขึ้นต้นด้วย / หรือ https:// หรือ mailto:'))
      e.chain().focus().extendMarkRange('link').setLink({ href }).run()
    },
  },
  { icon: Code, label: 'ข้อความแบบโค้ด', run: (e: Editor) => e.chain().focus().toggleCode().run(), on: (e: Editor) => e.isActive('code') },
] as const
const toolbar = props.docs ? [...tools, ...docTools] : tools

// controls for the selected image; no focus() here, so typing in the caption box is not interrupted
const imgAttrs = () => (current.value?.getAttributes('image') ?? {}) as { width?: number | null; align?: string; title?: string | null; alt?: string | null }
const setImg = (attrs: Record<string, unknown>) => current.value?.chain().updateAttributes('image', attrs).run()
const widths = [{ v: null, n: 'ตามจริง' }, { v: 30, n: '30%' }, { v: 50, n: '50%' }, { v: 75, n: '75%' }, { v: 100, n: '100%' }] as const
const aligns = [{ v: 'left', icon: AlignLeft, n: 'ชิดซ้าย' }, { v: 'center', icon: AlignCenter, n: 'กึ่งกลาง' }, { v: 'right', icon: AlignRight, n: 'ชิดขวา' }] as const
const segBtn = (on: boolean) => ['h-8 min-w-8 rounded-md border px-2 text-xs transition-colors', on ? 'border-primary bg-primary text-on-primary' : 'border-line hover:bg-fg/5']

function pickImage(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]; input.value = ''
  if (f) addImage(f)
}
</script>

<template>
  <div class="mb-4 overflow-hidden rounded-lg border border-line bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
    <div v-if="current" class="flex flex-wrap items-center gap-0.5 border-b border-line bg-bg/60 p-1.5" role="toolbar" aria-label="เครื่องมือจัดรูปแบบ">
      <template v-for="(t, i) in toolbar" :key="i">
        <span v-if="'sep' in t" class="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button v-else type="button" :aria-label="t.label" :title="t.label" :aria-pressed="t.on(current)" :disabled="'off' in t && t.off(current)"
          :class="['grid size-8 place-items-center rounded-md transition-colors hover:bg-fg/10 disabled:opacity-35', t.on(current) && 'bg-primary/15 text-primary']"
          @click="t.run(current)"><component :is="t.icon" class="size-4" /></button>
      </template>
      <span v-if="!docs" class="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <label v-if="!docs" class="grid size-8 cursor-pointer place-items-center rounded-md transition-colors hover:bg-fg/10 focus-within:outline focus-within:outline-2 focus-within:outline-primary" title="แทรกรูป">
        <ImagePlus class="size-4" /><span class="sr-only">แทรกรูป</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="pickImage" />
      </label>
    </div>
 <!-- image settings appear when an image is selected -->
    <div v-if="current && current.isActive('image')" class="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-line bg-primary/5 px-3 py-2" role="group" aria-label="ตั้งค่ารูปที่เลือก">
      <div>
        <div class="eyebrow mb-1">ขนาด</div>
        <div class="flex gap-1"><button v-for="w in widths" :key="String(w.v)" type="button" :class="segBtn((imgAttrs().width ?? null) === w.v)" :aria-pressed="(imgAttrs().width ?? null) === w.v" @click="setImg({ width: w.v })">{{ w.n }}</button></div>
      </div>
      <div>
        <div class="eyebrow mb-1">จัดวาง</div>
        <div class="flex gap-1"><button v-for="a in aligns" :key="a.v" type="button" :class="segBtn((imgAttrs().align ?? 'center') === a.v)" :aria-pressed="(imgAttrs().align ?? 'center') === a.v" :aria-label="a.n" :title="a.n" @click="setImg({ align: a.v })"><component :is="a.icon" class="mx-auto size-4" /></button></div>
      </div>
      <label class="min-w-[180px] flex-1">
        <span class="eyebrow mb-1 block">คำบรรยายใต้รูป</span>
        <input type="text" :value="imgAttrs().title ?? ''" placeholder="ไม่ใส่ก็ได้" class="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm outline-none focus:border-primary" @input="setImg({ title: ($event.target as HTMLInputElement).value || null })" />
      </label>
      <label class="min-w-[150px] flex-1">
        <span class="eyebrow mb-1 block">คำอธิบายสำหรับโปรแกรมอ่านหน้าจอ</span>
        <input type="text" :value="imgAttrs().alt ?? ''" class="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm outline-none focus:border-primary" @input="setImg({ alt: ($event.target as HTMLInputElement).value })" />
      </label>
      <button type="button" class="grid h-8 place-items-center gap-1 rounded-md border border-line px-2 text-xs text-danger hover:bg-danger/10" aria-label="ลบรูป" title="ลบรูป" @click="current.chain().focus().deleteSelection().run()"><Trash2 class="size-4" /></button>
    </div>
    <EditorContent v-if="current" :editor="current" class="max-h-[60dvh] min-h-[40dvh] overflow-y-auto px-4 py-3" />
  </div>
</template>

<style>
.ProseMirror { outline: none; min-height: 36dvh; }
.ProseMirror figure.ProseMirror-selectednode, .ProseMirror img.ProseMirror-selectednode { outline: 2px solid rgb(var(--c-primary)); outline-offset: 4px; border-radius: 4px; }
.ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: rgb(var(--c-fg) / .4); }
</style>
