<script setup lang="ts">
import { ref } from 'vue'
import { ImagePlus, Trash2 } from 'lucide-vue-next'
import { client, ok } from '../api'
import { prepareImage } from '../image'
import { toast, toastError } from '../toast'
import BookCover from './BookCover.vue'
import Button from './ui/Button.vue'
import FileButton from './ui/FileButton.vue'

const props = defineProps<{ storyId: number; title: string; genre?: string; image?: string }>()
const emit = defineEmits<{ changed: [] }>()
const busy = ref(false)

async function upload(file: File) {
  busy.value = true
  try {
    const small = await prepareImage(file, 900)
    await ok(client.api.admin.stories({ id: props.storyId }).cover.post({ file: small }))
    toast('อัปโหลดรูปปกแล้ว'); emit('changed')
  } catch (err) { toastError(err) } finally { busy.value = false }
}
async function remove() {
  busy.value = true
  try { await ok(client.api.admin.stories({ id: props.storyId }).cover.delete()); toast('ลบรูปปกแล้ว ใช้ปกอัตโนมัติแทน'); emit('changed') }
  catch (err) { toastError(err) } finally { busy.value = false }
}
</script>

<template>
  <div>
    <div class="mb-3 w-40"><BookCover :title="title" :genre="genre" :image="image" /></div>
    <div class="flex flex-wrap gap-2">
      <FileButton :disabled="busy" @pick="upload"><ImagePlus class="size-4" />{{ busy ? 'กำลังอัปโหลด…' : image ? 'เปลี่ยนรูปปก' : 'อัปโหลดรูปปก' }}</FileButton>
      <Button v-if="image" variant="ghost" size="sm" :disabled="busy" @click="remove"><Trash2 class="size-4" />ลบรูป</Button>
    </div>
    <p class="muted mt-2 max-w-[200px] text-xs">ภาพแนวตั้งสัดส่วน 2:3 จะพอดีที่สุด ระบบย่อรูปให้เอง</p>
  </div>
</template>
