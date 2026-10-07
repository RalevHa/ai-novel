<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import Button from '../components/ui/Button.vue'
import Input from '../components/ui/Input.vue'
import { useAuth } from '../stores/auth'

const auth = useAuth(), route = useRoute(), router = useRouter()
const email = ref(''), password = ref(''), error = ref(''), busy = ref(false)

async function submit() {
  busy.value = true; error.value = ''
  try {
    await auth.login(email.value, password.value)
    router.push(typeof route.query.next === 'string' ? route.query.next : '/story')
  } catch (e) {
    // right password but the address was never confirmed: the server has sent a code, so go and enter it
    if ((e as { data?: { needsVerify?: boolean } }).data?.needsVerify) router.push({ path: '/verify', query: { email: email.value } })
    else error.value = (e as Error).message
  } finally { busy.value = false }
}
</script>

<template>
  <AuthShell title="เข้าสู่ระบบ">
    <form @submit.prevent="submit">
      <Input v-model="email" label="อีเมล" type="email" autocomplete="username" required />
      <Input v-model="password" label="รหัสผ่าน" type="password" autocomplete="current-password" required />
      <p class="-mt-2 mb-4 text-sm"><router-link to="/forgot" class="-my-3 inline-block py-3 text-primary underline underline-offset-2">ลืมรหัสผ่าน?</router-link></p>
      <p v-if="error" class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{{ error }}</p>
      <Button type="submit" size="lg" class="w-full" :loading="busy">เข้าสู่ระบบ</Button>
    </form>
    <p class="mt-5 text-sm">ยังไม่มีบัญชี? <router-link to="/register" class="-my-3 inline-block py-3 text-primary underline underline-offset-2">สมัครสมาชิก</router-link></p>
  </AuthShell>
</template>
