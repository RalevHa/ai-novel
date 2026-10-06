<script setup lang="ts">
import { reactive } from 'vue'
import { MODELS } from '../models'
import Button from './ui/Button.vue'
import Input from './ui/Input.vue'
import Switch from './ui/Switch.vue'
import Textarea from './ui/Textarea.vue'

export type StoryInput = {
  title: string; synopsis: string; genre: string; mood: string
  premise: string; systemPrompt: string; model: string; published: boolean
}
const props = defineProps<{ initial?: Partial<StoryInput>; busy?: boolean; submitLabel?: string }>()
const emit = defineEmits<{ save: [StoryInput] }>()

const f = reactive<StoryInput>({
  title: '', synopsis: '', genre: '', mood: '', premise: '', systemPrompt: '', model: '', published: false,
  ...props.initial,
})
const models = MODELS
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
    <Textarea v-model="f.systemPrompt" label="System prompt (เว้นว่าง = ใช้ค่าเริ่มต้นนักเขียนนิยายญี่ปุ่น)" :rows="3" />
    <Input v-model="f.model" label="Model" list="story-models" hint="slug จาก OpenRouter เว้นว่างเพื่อใช้ค่าเริ่มต้นของ server" />
    <datalist id="story-models"><option v-for="m in models" :key="m" :value="m" /></datalist>
    <Switch v-model="f.published" label="เผยแพร่เรื่องนี้" class="mb-5" />
    <Button type="submit" :loading="busy">{{ submitLabel || 'บันทึก' }}</Button>
  </form>
</template>
