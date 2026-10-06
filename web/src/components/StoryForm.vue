<script setup lang="ts">
import { reactive } from 'vue'
import { MODELS } from '../models'
import Button from './ui/Button.vue'
import ComboInput from './ui/ComboInput.vue'
import Segmented from './ui/Segmented.vue'
import Input from './ui/Input.vue'
import Switch from './ui/Switch.vue'
import Textarea from './ui/Textarea.vue'

export type StoryInput = {
  title: string; synopsis: string; genre: string; mood: string
  premise: string; outline: string; systemPrompt: string; model: string; published: boolean; status: 'ongoing' | 'completed'
}
const props = defineProps<{ initial?: Partial<StoryInput>; busy?: boolean; submitLabel?: string }>()
const emit = defineEmits<{ save: [StoryInput] }>()

const f = reactive<StoryInput>({
  title: '', synopsis: '', genre: '', mood: '', premise: '', outline: '', systemPrompt: '', model: '', published: false, status: 'ongoing',
  ...props.initial,
})
const models = MODELS
const STATUSES = [{ k: 'ongoing', n: 'กำลังเขียน' }, { k: 'completed', n: 'จบแล้ว' }] as const
</script>

<template>
  <form @submit.prevent="emit('save', { ...f })">
    <Input v-model="f.title" label="ชื่อเรื่อง" required />
    <Textarea v-model="f.synopsis" label="เรื่องย่อ (ผู้อ่านเห็น)" :rows="3" />
    <div class="grid gap-x-4 sm:grid-cols-2">
      <Input v-model="f.genre" label="แนว" placeholder="เช่น Isekai, Slice of Life" />
      <Input v-model="f.mood" label="ความรู้สึกที่ต้องการ" placeholder="เช่น อบอุ่นหัวใจ" />
    </div>
    <Textarea v-model="f.premise" label="พล็อต / ตัวละครตั้งต้น (ส่งให้ AI เท่านั้น)" :rows="4" />
    <Textarea v-model="f.outline" label="แผนเรื่อง (หนึ่งบรรทัดต่อหนึ่งตอน)" :rows="5" placeholder="พระเอกตื่นในต่างโลก&#10;พบเพื่อนร่วมทางคนแรก&#10;ต่อสู้กับมังกร" />
    <p class="muted -mt-2 mb-4 text-xs">เลือก "เขียนตามแผนเรื่อง" ตอนสั่งเขียน ระบบจะใช้บรรทัดแรกที่ยังไม่มี ✓ เป็นคำสั่ง แล้วใส่ ✓ ให้เมื่อเขียนครบตอน</p>
    <Textarea v-model="f.systemPrompt" label="System prompt (เว้นว่าง = ใช้ค่าเริ่มต้นนักเขียนนิยายญี่ปุ่น)" :rows="3" />
    <ComboInput v-model="f.model" label="Model" :options="models" hint="slug จาก OpenRouter หรือ local:ชื่อโมเดล เพื่อใช้โมเดลในเครื่อง (Ollama) เว้นว่างเพื่อใช้ค่าเริ่มต้นของ server" />
    <div class="mb-4">
      <div class="mb-1.5 text-sm font-medium">สถานะเรื่อง (ผู้อ่านเห็น)</div>
      <Segmented :model-value="f.status" :options="STATUSES" label="สถานะเรื่อง" class="max-w-xs" @update:model-value="f.status = $event as StoryInput['status']" />
    </div>
    <Switch v-model="f.published" label="เผยแพร่เรื่องนี้" class="mb-5" />
    <Button type="submit" :loading="busy">{{ submitLabel || 'บันทึก' }}</Button>
  </form>
</template>
