<script setup lang="ts">
import { ref } from 'vue'
import { client, ok } from '../api'
import Button from '../components/ui/Button.vue'
import Input from '../components/ui/Input.vue'
import Textarea from '../components/ui/Textarea.vue'
import { useAuth } from '../stores/auth'
import { toast, toastError } from '../toast'

const auth = useAuth()
const ROLE = { admin: 'ผู้ดูแลระบบ', writer: 'นักเขียน', user: 'ผู้อ่าน' }
const name = ref(auth.user!.name), bio = ref(auth.user!.bio ?? '')
const current = ref(''), next = ref('')
const busy = ref(false)

async function save() {
  busy.value = true
  try {
    auth.user = await ok(client.api.me.profile.patch({ name: name.value, bio: bio.value, ...(next.value && { currentPassword: current.value, newPassword: next.value }) }))
    current.value = next.value = ''
    toast('บันทึกแล้ว')
  } catch (e) { toastError(e) } finally { busy.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-[560px]">
    <h1 class="mb-1 font-serif text-[26px] font-bold">โปรไฟล์ของฉัน</h1>
    <p class="muted mb-6 text-sm">{{ auth.user!.email }} · {{ ROLE[auth.user!.role] }}<template v-if="auth.canWrite"> · <router-link :to="`/author/${auth.user!.id}`" class="text-primary underline underline-offset-2">ดูหน้าผู้แต่งของฉัน</router-link></template></p>
    <form @submit.prevent="save">
      <Input v-model="name" label="ชื่อที่แสดง" required />
      <Textarea v-model="bio" label="แนะนำตัว (แสดงในหน้าผู้แต่ง ไม่เกิน 500 ตัวอักษร)" :rows="5" />
      <h2 class="mb-3 mt-8 font-medium">เปลี่ยนรหัสผ่าน</h2>
      <Input v-model="current" label="รหัสผ่านปัจจุบัน" type="password" autocomplete="current-password" />
      <Input v-model="next" label="รหัสผ่านใหม่" type="password" autocomplete="new-password" :minlength="8" hint="อย่างน้อย 8 ตัวอักษร เว้นว่างไว้ถ้าไม่เปลี่ยน" />
      <Button type="submit" size="lg" class="w-full" :loading="busy">บันทึก</Button>
    </form>
  </div>
</template>
