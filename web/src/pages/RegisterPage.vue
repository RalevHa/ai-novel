<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import Button from '../components/ui/Button.vue'
import Input from '../components/ui/Input.vue'
import { useAuth } from '../stores/auth'

const auth = useAuth(), router = useRouter()
const email = ref(''), name = ref(''), password = ref(''), error = ref(''), busy = ref(false)

async function submit() {
  busy.value = true; error.value = ''
  try {
    await auth.register(email.value, name.value, password.value)
    router.push('/')
  } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}
</script>

<template>
  <AuthShell title="สมัครสมาชิก">
    <form @submit.prevent="submit">
      <Input v-model="email" label="อีเมล" type="email" autocomplete="username" required />
      <Input v-model="name" label="ชื่อที่แสดง" autocomplete="nickname" required />
      <Input v-model="password" label="รหัสผ่าน" hint="อย่างน้อย 8 ตัวอักษร" type="password" autocomplete="new-password" :minlength="8" required />
      <p v-if="error" class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{{ error }}</p>
      <Button type="submit" size="lg" class="w-full" :loading="busy">สมัครสมาชิก</Button>
    </form>
    <p class="mt-5 text-sm">มีบัญชีแล้ว? <router-link to="/login" class="text-primary underline underline-offset-2">เข้าสู่ระบบ</router-link></p>
  </AuthShell>
</template>
