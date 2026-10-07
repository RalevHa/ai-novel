<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { client, ok } from '../api'
import AuthShell from '../components/AuthShell.vue'
import Button from '../components/ui/Button.vue'
import Input from '../components/ui/Input.vue'
import OtpInput from '../components/OtpInput.vue'
import { toast } from '../toast'

const router = useRouter()
const email = ref(''), code = ref(''), password = ref(''), sent = ref(false), error = ref(''), busy = ref(false)

// the server allows a new code once a minute; the countdown just mirrors that
const wait = ref(0)
const timer = setInterval(() => { if (wait.value > 0) wait.value-- }, 1000)
onBeforeUnmount(() => clearInterval(timer))

async function send() {
  busy.value = true; error.value = ''
  try { await ok(client.api.auth.forgot.post({ email: email.value })); sent.value = true; wait.value = 60 }
  catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}
async function reset() {
  busy.value = true; error.value = ''
  try {
    await ok(client.api.auth.reset.post({ email: email.value, code: code.value, password: password.value }))
    toast('ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบได้เลย')
    router.push('/login')
  } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}
</script>

<template>
  <AuthShell title="ลืมรหัสผ่าน">
    <form v-if="!sent" @submit.prevent="send">
      <p class="mb-4 text-sm leading-relaxed">กรอกอีเมลที่ใช้สมัคร เราจะส่งรหัส 6 หลักไปให้ตั้งรหัสผ่านใหม่</p>
      <Input v-model="email" label="อีเมล" type="email" autocomplete="username" required />
      <p v-if="error" class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{{ error }}</p>
      <Button type="submit" size="lg" class="w-full" :loading="busy">ส่งรหัส</Button>
    </form>
    <form v-else @submit.prevent="reset">
      <p class="mb-4 text-sm leading-relaxed">ถ้ามีบัญชีที่ใช้ <strong class="break-all">{{ email }}</strong> เราส่งรหัสไปให้แล้ว (ดูในจดหมายขยะด้วย)</p>
      <OtpInput v-model="code" />
      <Input v-model="password" label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร" type="password" autocomplete="new-password" :minlength="8" required />
      <p v-if="error" class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{{ error }}</p>
      <Button type="submit" size="lg" class="w-full" :loading="busy" :disabled="code.length !== 6">ตั้งรหัสผ่านใหม่</Button>
      <p class="mt-4 text-sm">
        <button v-if="wait === 0" type="button" class="-my-3 inline-block py-3 text-primary underline underline-offset-2" @click="send">ส่งรหัสใหม่</button>
        <span v-else class="muted">ส่งใหม่ได้ใน {{ wait }} วินาที</span>
      </p>
    </form>
    <p class="mt-5 text-sm"><router-link to="/login" class="-my-3 inline-block py-3 text-primary underline underline-offset-2">กลับไปเข้าสู่ระบบ</router-link></p>
  </AuthShell>
</template>
