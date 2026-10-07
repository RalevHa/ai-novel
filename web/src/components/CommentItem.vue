<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { fmtDateTime } from '../genre'
import { useAuth } from '../stores/auth'
import Button from './ui/Button.vue'
import Textarea from './ui/Textarea.vue'

export type CommentView = { id: number; body: string; createdAt: string | Date; editedAt: string | Date | null; userId: number; userName: string; isAuthor: boolean; canDelete: boolean; score: number; myVote: number | null }

// `save` resolves true when the new text was stored (the parent reloads the list); the form closes only then
const props = defineProps<{ c: CommentView; confirming: boolean; save: (text: string) => Promise<boolean> }>()
defineEmits<{ vote: [value: -1 | 0 | 1]; reply: []; askDelete: []; cancelDelete: []; remove: []; report: [] }>()
const auth = useAuth()
const editing = ref(false), draft = ref(''), saving = ref(false)
const startEdit = () => { draft.value = props.c.body; editing.value = true }
async function commit() {
  if (!draft.value.trim() || draft.value === props.c.body) { editing.value = false; return }
  saving.value = true
  try { if (await props.save(draft.value)) editing.value = false } finally { saving.value = false }
}
const btn = (on: boolean) => ['grid size-11 place-items-center rounded-lg hover:bg-fg/5 disabled:opacity-40 sm:size-8', on && 'text-primary']
</script>

<template>
  <div class="flex gap-2">
    <div class="flex w-9 shrink-0 flex-col items-center text-sm">
      <button type="button" :class="btn(c.myVote === 1)" :disabled="c.userId === auth.user?.id" :aria-pressed="c.myVote === 1" aria-label="โหวตขึ้น" @click="$emit('vote', c.myVote === 1 ? 0 : 1)"><ChevronUp class="size-5" aria-hidden="true" /></button>
      <span class="tabular-nums" :aria-label="`คะแนน ${c.score}`">{{ c.score }}</span>
      <button type="button" :class="btn(c.myVote === -1)" :disabled="c.userId === auth.user?.id" :aria-pressed="c.myVote === -1" aria-label="โหวตลง" @click="$emit('vote', c.myVote === -1 ? 0 : -1)"><ChevronDown class="size-5" aria-hidden="true" /></button>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2 text-sm">
        <span class="font-medium">{{ c.userName }}</span>
        <span v-if="c.isAuthor" class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">ผู้แต่ง</span>
        <span class="muted text-xs">{{ fmtDateTime(c.createdAt) }}<template v-if="c.editedAt"> (แก้ไขแล้ว)</template></span>
      </div>
      <form v-if="editing" class="mt-2" @submit.prevent="commit">
        <Textarea v-model="draft" :rows="3" compact />
        <div class="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="editing = false">ยกเลิก</Button>
          <Button type="submit" size="sm" :loading="saving" :disabled="!draft.trim() || draft.length > 1000">บันทึก</Button>
        </div>
      </form>
      <p v-else class="mt-1 whitespace-pre-wrap break-words leading-relaxed">{{ c.body }}</p>
      <div class="mt-1 flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" @click="$emit('reply')">ตอบกลับ</Button>
        <Button v-if="c.userId === auth.user?.id && !editing" variant="ghost" size="sm" @click="startEdit">แก้ไข</Button>
        <Button v-else-if="auth.user && c.userId !== auth.user.id" variant="ghost" size="sm" @click="$emit('report')">รายงาน</Button>
        <template v-if="c.canDelete">
          <Button v-if="!confirming" variant="ghost" size="sm" @click="$emit('askDelete')">ลบ</Button>
          <template v-else>
            <Button variant="danger" size="sm" @click="$emit('remove')">ยืนยันลบ</Button>
            <Button variant="ghost" size="sm" @click="$emit('cancelDelete')">ยกเลิก</Button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
