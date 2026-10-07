<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { client, ok } from '../api'
import AuthShell from '../components/AuthShell.vue'
import Button from '../components/ui/Button.vue'
import OtpInput from '../components/OtpInput.vue'
import { useAuth } from '../stores/auth'
import { toast, toastError } from '../toast'

const auth = useAuth(), route = useRoute(), router = useRouter()
const email = String(route.query.email ?? '')
const code = ref(''), error = ref(''), busy = ref(false)
if (!email) router.replace('/register')

async function submit() {
  busy.value = true; error.value = ''
  try {
    await auth.verify(email, code.value)
    router.push('/story')
  } catch (e) { error.value = (e as Error).message; code.value = '' } finally { busy.value = false }
}

// the server allows a new code once a minute; the countdown just mirrors that
const wait = ref(60)
const timer = setInterval(() => { if (wait.value > 0) wait.value-- }, 1000)
onBeforeUnmount(() => clearInterval(timer))
async function resend() {
  try { await ok(client.api.auth.resend.post({ email })); wait.value = 60; toast('ส่งรหัสใหม่แล้ว') } catch (e) { toastError(e) }
}
</script>

<template>
  <AuthShell title="ยืนยันอีเมล">
    <p class="mb-5 text-sm leading-relaxed">เราส่งรหัส 6 หลักไปที่ <strong class="break-all">{{ email }}</strong> กรอกรหัสนั้นเพื่อยืนยันและเข้าใช้งาน (ถ้าไม่เห็น ลองดูในจดหมายขยะ)</p>
    <form @submit.prevent="submit">
      <OtpInput v-model="code" />
      <p v-if="error" class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{{ error }}</p>
      <Button type="submit" size="lg" class="w-full" :loading="busy" :disabled="code.length !== 6">ยืนยัน</Button>
    </form>
    <p class="mt-5 text-sm">
      ไม่ได้รับรหัส?
      <button v-if="wait === 0" type="button" class="-my-3 inline-block py-3 text-primary underline underline-offset-2" @click="resend">ส่งรหัสใหม่</button>
      <span v-else class="muted">ส่งใหม่ได้ใน {{ wait }} วินาที</span>
    </p>
    <p class="mt-1 text-sm"><router-link to="/login" class="-my-3 inline-block py-3 text-primary underline underline-offset-2">กลับไปเข้าสู่ระบบ</router-link></p>
  </AuthShell>
</template>
